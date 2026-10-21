// npx tsx --test --experimental-test-module-mocks lib/robo-zen/preparar-empresa.cnpj.test.ts
//
// Ponta a ponta de `prepararDadosParaEnvio` NA PARTE DO CNPJ: o SharePoint, a leitura do PDF,
// o Zen e o cadastro do Questor são simulados (module mocks do Node); a lógica de decisão
// (filtro de documentos, busca em ordem, memória da busca, conferência com o cadastro,
// status e motivos) é a de verdade.
import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import type { CadastroEmpresa } from "./conferencia-cnpj";
import type { DepsPreparo } from "./preparar-empresa";
import { VERSAO_LEITURA, type BuscaParcial, type DocTentado, type DocVencedor } from "./busca-parcial";
import { MOTIVO_PRONTA_DOC_NOVO } from "./novidades-envio";
import type { EnvioConhecido } from "./novidades-envio";

// CNPJs com dígito verificador correto.
const DA_EMPRESA = "11.222.333/0001-81";
const SINDICATO = "62.811.096/0001-25";
const SOCIA = "28.107.999/0001-91";
const INVALIDO = "11.222.333/0001-82";

// ---- simulações ----
const arquivosDaPasta: { id: string; nome: string; modificadoEm: string | null }[] = [];
const textosPorId = new Map<string, string>();
// Documentos escaneados (precisam de OCR) e o texto EXTRA que a segunda leitura (análise automática
// de layout) acrescenta ao da primeira.
const escaneadosPorId = new Set<string>();
const segundoTextoPorId = new Map<string, string>();
const msGastosNaLeituraPorId = new Map<string, number>();
let segundasLeituras: string[] = [];
let segundaLeituraFalha = false;
let relogioFalso = false;
let baixados: string[] = [];
let consultasAoZen: string[] = [];
let clientesDoZen = new Map<string, string>(); // cnpj (só dígitos) -> nome do cliente

class QuestorZenErrorFalso extends Error {
  status = 500;
}
class ClienteNaoEncontradoErrorFalso extends QuestorZenErrorFalso {
  override status = 404;
}

mock.module("./empresas-sharepoint", {
  namedExports: {
    listarContratos: async () => arquivosDaPasta,
    baixarConteudo: async (_ctx: unknown, id: string) => {
      baixados.push(id);
      return Buffer.from(id);
    },
  },
});
mock.module("./certidao-parser", {
  namedExports: {
    // Imita o leitor: o CNPJ "do leitor" é o primeiro VÁLIDO que aparece no texto.
    extrairDadosCertidao: async (bytes: Buffer) => {
      const id = bytes.toString();
      const texto = textosPorId.get(id) ?? "";
      const m = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
      const { cnpjValido } = await import("./cnpj");
      if (texto === "__ERRO_AO_LER__") throw new Error("PDF corrompido");
      const gasto = msGastosNaLeituraPorId.get(id);
      if (gasto && relogioFalso) mock.timers.tick(gasto); // OCR lento: o relógio anda
      return { cnpj: m.find((c) => cnpjValido(c)) ?? m[0] ?? null, textoBruto: texto, pareceEscaneado: escaneadosPorId.has(id) };
    },
    // Imita a segunda leitura: soma o texto extra ao da primeira e reavalia o CNPJ "do leitor".
    lerDeNovoComSegmentacaoAutomatica: async (primeira: { cnpj: string | null; textoBruto: string }, bytes: Buffer) => {
      const id = bytes.toString();
      segundasLeituras.push(id);
      if (segundaLeituraFalha) throw new Error("o tesseract caiu");
      const junto = [primeira.textoBruto, segundoTextoPorId.get(id) ?? ""].filter(Boolean).join("\n");
      const m = junto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
      const { cnpjValido } = await import("./cnpj");
      return { ...primeira, cnpj: m.find((c) => cnpjValido(c)) ?? m[0] ?? primeira.cnpj, textoBruto: junto, pareceEscaneado: true };
    },
    // A checagem rápida (sem OCR) dos documentos que a busca nem abriu: escaneado é o que o cenário disser.
    pdfPareceEscaneado: async (bytes: Buffer) => escaneadosPorId.has(bytes.toString()),
  },
});
mock.module("../questor-zen", {
  namedExports: {
    QuestorZenError: QuestorZenErrorFalso,
    ClienteNaoEncontradoError: ClienteNaoEncontradoErrorFalso,
    hasQuestorZenToken: () => true,
    consultarCliente: async (cnpj: string) => {
      const digitos = cnpj.replace(/\D/g, "");
      consultasAoZen.push(digitos);
      const nome = clientesDoZen.get(digitos);
      if (nome === undefined) throw new ClienteNaoEncontradoErrorFalso("cliente não encontrado");
      return { Nome: nome };
    },
  },
});
mock.module("./db", { namedExports: {} });
mock.module("./cadastro-questor", { namedExports: { cadastroDaEmpresa: async () => ({ encontrada: false }) } });

// O módulo sob teste só pode ser carregado DEPOIS dos mocks acima (o projeto compila os .ts como
// CommonJS, que não aceita `await` no topo do arquivo — por isso o import fica num `before`).
type Preparar = typeof import("./preparar-empresa");
let prepararDadosParaEnvio: Preparar["prepararDadosParaEnvio"];
let MOTIVO_CNPJ_NAO_CONFIRMADO: string;
let MOTIVO_CNPJ_NAO_ENCONTRADO: string;
let MOTIVO_CLIENTE_NAO_CADASTRADO: string;
let MOTIVO_ERRO: string;
let MOTIVO_PRONTA: string;
let MOTIVO_BUSCA_INCOMPLETA: string;
before(async () => {
  const m = await import("./preparar-empresa");
  ({
    prepararDadosParaEnvio,
    MOTIVO_CNPJ_NAO_CONFIRMADO,
    MOTIVO_CNPJ_NAO_ENCONTRADO,
    MOTIVO_CLIENTE_NAO_CADASTRADO,
    MOTIVO_ERRO,
    MOTIVO_PRONTA,
    MOTIVO_BUSCA_INCOMPLETA,
  } = m);
});

const EMPRESA = { nome: "Empresa Teste Ltda", codigo: "576", itemId: "pasta-576", caminho: "Empresas/Teste_576", grupoNome: null };

function montarDeps(opcoes: {
  cadastro: CadastroEmpresa | Error;
  envios?: EnvioConhecido[];
  memoria?: Map<string, BuscaParcial>;
}): DepsPreparo {
  const memoria = opcoes.memoria ?? new Map<string, BuscaParcial>();
  return {
    enviosDaEmpresa: async () => opcoes.envios ?? [],
    obterBuscaParcial: async (codigo) => memoria.get(codigo) ?? null,
    salvarBuscaParcial: async (codigo, busca: { documentos: DocTentado[]; vencedor: DocVencedor | null; passos: number }) => {
      memoria.set(codigo, { ...busca, atualizado_em: new Date().toISOString() });
    },
    cadastroDaEmpresa: async () => {
      if (opcoes.cadastro instanceof Error) throw opcoes.cadastro;
      return opcoes.cadastro;
    },
  };
}

function cenario(
  docs: { nome: string; texto: string; escaneado?: boolean; segundoTexto?: string; msNaLeitura?: number }[],
  zen: Record<string, string> = {}
) {
  arquivosDaPasta.length = 0;
  textosPorId.clear();
  escaneadosPorId.clear();
  segundoTextoPorId.clear();
  msGastosNaLeituraPorId.clear();
  segundasLeituras = [];
  segundaLeituraFalha = false;
  baixados = [];
  consultasAoZen = [];
  clientesDoZen = new Map(Object.entries(zen).map(([cnpj, nome]) => [cnpj.replace(/\D/g, ""), nome]));
  docs.forEach((d, i) => {
    const id = `id-${i}`;
    arquivosDaPasta.push({ id, nome: d.nome, modificadoEm: "2026-01-01T00:00:00Z" });
    textosPorId.set(id, d.texto);
    if (d.escaneado) escaneadosPorId.add(id);
    if (d.segundoTexto !== undefined) segundoTextoPorId.set(id, d.segundoTexto);
    if (d.msNaLeitura) msGastosNaLeituraPorId.set(id, d.msNaLeitura);
  });
}

const cadastro = (cnpj: string | null): CadastroEmpresa => ({ encontrada: true, cnpj, ativa: true });
const ctx = {} as never;

test("contrato cita o sindicato ANTES da empresa: usa o CNPJ da empresa e consulta o Zen com ele", async () => {
  cenario(
    [{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}. Empresa ${DA_EMPRESA}.` }],
    { [SINDICATO]: "OUTRA EMPRESA S/A", [DA_EMPRESA]: "EMPRESA TESTE LTDA" }
  );
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, true);
  assert.equal(r.motivo, MOTIVO_PRONTA);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.match(r.status, /cliente no Questor: EMPRESA TESTE LTDA/);
  assert.deepEqual(consultasAoZen, ["11222333000181"], "o Zen só pode ser consultado com o CNPJ da empresa");
});

test("o CNPJ certo está num documento mais adiante: o primeiro (de outra empresa) é descartado", async () => {
  cenario(
    [
      { nome: "Certidao de inteiro teor.pdf", texto: `Sócia ${SOCIA}` },
      { nome: "Alteracao contratual.pdf", texto: `Empresa ${DA_EMPRESA}` },
    ],
    { [SOCIA]: "OUTRO CLIENTE", [DA_EMPRESA]: "EMPRESA TESTE LTDA" }
  );
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, true);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.equal(r.documentoCnpjOrigem, "Alteracao contratual.pdf");
  assert.deepEqual(consultasAoZen, ["11222333000181"]);
});

test("só CNPJs de outras empresas: 'puxando CNPJ ERRADO', nunca pronta, Zen nem é consultado", async () => {
  cenario(
    [
      { nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}` },
      { nome: "Alteracao.pdf", texto: `Sócia ${SOCIA}` },
    ],
    { [SINDICATO]: "OUTRA EMPRESA S/A", [SOCIA]: "MAIS UMA" }
  );
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.equal(r.cnpj, null);
  assert.equal(r.documentoCnpjOrigem, null);
  assert.match(r.status, /^CNPJ NÃO ENCONTRADO em nenhum documento — puxando CNPJ ERRADO: /);
  assert.match(r.status, new RegExp(`cadastro do Questor: ${DA_EMPRESA.replace(/[./]/g, "\\$&")}`));
  assert.match(r.status, /62\.811\.096\/0001-25 em "(Contrato Social|Alteracao)\.pdf"/);
  assert.match(r.status, /28\.107\.999\/0001-91 em "(Contrato Social|Alteracao)\.pdf"/);
  assert.deepEqual(consultasAoZen, [], "não pode perguntar ao Zen por um CNPJ que não é o da empresa");
});

test("sem nenhum CNPJ nos documentos: continua sendo 'CNPJ NÃO ENCONTRADO' comum (sem 'ERRADO')", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: "texto sem número nenhum" }]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.doesNotMatch(r.status, /ERRADO/);
  assert.match(r.status, /não encontrei um CNPJ/);
});

test("CNPJ com dígito errado (OCR) segue o tratamento de sempre, não vira 'ERRADO'", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `CNPJ ${INVALIDO}` }]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.doesNotMatch(r.status, /puxando CNPJ ERRADO/);
  assert.match(r.status, /não passa na conferência dos dígitos verificadores/);
});

test("empresa fora do cadastro do Questor: CNPJ lido NÃO fica confirmado (bloqueada, com o nome do cliente no Zen)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false } }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_CONFIRMADO);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.equal(r.documentoCnpjOrigem, "Contrato Social.pdf");
  assert.match(r.status, /^CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu 11\.222\.333\/0001-81 \(cliente no Zen: EMPRESA TESTE LTDA\)/);
  assert.match(r.status, /a empresa 576 não consta no cadastro de empresas do Questor/);
});

test("cadastro sem CNPJ válido: também bloqueia, e diz que o cliente não existe no Zen quando é o caso", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(null) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_CONFIRMADO);
  assert.match(r.status, /esse CNPJ não consta como cliente no Zen/);
  assert.match(r.status, /o cadastro da empresa 576 no Questor não tem um CNPJ válido/);
});

test("empresa BAIXADA (fora da lista de ativas) que ainda não recebeu nada: CNPJ confere, mas fica bloqueada", async () => {
  cenario([{ nome: "Distrato.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: true, cnpj: DA_EMPRESA, ativa: false } }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_CONFIRMADO);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.match(r.status, /^CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu 11\.222\.333\/0001-81 \(cliente no Zen: EMPRESA TESTE LTDA\), e esse é o CNPJ do cadastro, mas a empresa 576 está baixada/);
});

test("empresa BAIXADA com CNPJ errado nos documentos: continua sendo 'CNPJ ERRADO' (a baixa não esconde isso)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}` }], { [SINDICATO]: "OUTRA EMPRESA S/A" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: true, cnpj: DA_EMPRESA, ativa: false } }));
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.match(r.status, /puxando CNPJ ERRADO/);
  assert.deepEqual(consultasAoZen, []);
});

// ---- envio/consulta INDIVIDUAL (a pessoa confere na tela): confirmacaoManual ----

const MANUAL = { confirmacaoManual: true };

test("individual: empresa fora do cadastro fica PRONTA, com aviso visível (é como se envia uma empresa liberada à mão)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false } }), MANUAL);
  assert.equal(r.pronta, true);
  assert.equal(r.motivo, MOTIVO_PRONTA);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.match(r.status, /^PRONTA \(cliente no Questor: EMPRESA TESTE LTDA/);
  assert.match(r.status, /ATENÇÃO — CNPJ NÃO CONFIRMADO NO QUESTOR: a empresa 576 não consta no cadastro de empresas do Questor/);
  assert.match(r.status, /Confira na tela se o cliente do Zen é mesmo o desta empresa/);
});

test("individual: empresa baixada fica PRONTA, com aviso de baixa", async () => {
  cenario([{ nome: "Distrato.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: true, cnpj: DA_EMPRESA, ativa: false } }), MANUAL);
  assert.equal(r.pronta, true);
  assert.match(r.status, /ATENÇÃO — CNPJ NÃO CONFIRMADO NO QUESTOR: a empresa 576 está baixada/);
});

test("individual: CNPJ de OUTRA empresa continua bloqueado (ninguém libera 'CNPJ errado' pela tela)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}` }], { [SINDICATO]: "OUTRA EMPRESA S/A" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }), MANUAL);
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.match(r.status, /puxando CNPJ ERRADO/);
  assert.deepEqual(consultasAoZen, []);
});

test("individual: cadastro indisponível continua sendo ERRO (nunca segue sem conferir)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: new Error("API fora do ar") }), MANUAL);
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_ERRO);
});

test("individual, documento novo: sem referência vai com aviso; CNPJ anterior diferente do cadastro continua bloqueado", async () => {
  const envios: EnvioConhecido[] = [{ arquivo_nome: "Antigo.pdf", cnpj: DA_EMPRESA, enviado_em: "2026-10-01T00:00:00Z" }];
  cenario([{ nome: "Novo.pdf", texto: "x" }, { nome: "Antigo.pdf", texto: "x" }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const a = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false }, envios }), MANUAL);
  assert.equal(a.pronta, true);
  assert.equal(a.motivo, MOTIVO_PRONTA_DOC_NOVO);
  assert.match(a.status, /ATENÇÃO — CNPJ NÃO CONFIRMADO NO QUESTOR/);

  const enviosErrados: EnvioConhecido[] = [{ arquivo_nome: "Antigo.pdf", cnpj: SINDICATO, enviado_em: "2026-10-01T00:00:00Z" }];
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), envios: enviosErrados }), MANUAL);
  assert.equal(b.pronta, false);
  assert.match(b.status, /o CNPJ usado nos envios anteriores/);
});

test("CNPJ confere com o cadastro mas a empresa não é cliente do Zen: 'cliente não cadastrado' (verdadeiro agora)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }], {});
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CLIENTE_NAO_CADASTRADO);
  assert.match(r.status, /o CNPJ 11\.222\.333\/0001-81, que confere com o cadastro desta empresa no Questor, não é cliente no Zen/);
});

test("não conseguir consultar o cadastro é ERRO (nunca segue sem conferir); falha passageira sobe", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const erro = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: new Error("QUESTOR_API_KEY não configurada") }));
  assert.equal(erro.pronta, false);
  assert.equal(erro.motivo, MOTIVO_ERRO);
  assert.match(erro.status, /Não consegui consultar o cadastro de empresas do Questor \(QUESTOR_API_KEY não configurada\)/);
  assert.deepEqual(consultasAoZen, []);

  await assert.rejects(
    prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: new TypeError("fetch failed") })),
    /fetch failed/
  );
});

test("documento novo numa empresa já enviada: CNPJ do envio anterior igual ao do cadastro → pronta", async () => {
  cenario([{ nome: "Novo.pdf", texto: "irrelevante" }, { nome: "Antigo.pdf", texto: "irrelevante" }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const envios: EnvioConhecido[] = [{ arquivo_nome: "Antigo.pdf", cnpj: DA_EMPRESA, enviado_em: "2026-10-01T00:00:00Z" }];
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), envios }));
  assert.equal(r.pronta, true);
  assert.equal(r.motivo, MOTIVO_PRONTA_DOC_NOVO);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.deepEqual(baixados, [], "usa o CNPJ do envio anterior, sem baixar PDF");
});

test("documento novo numa empresa já enviada e hoje baixada (ex.: distrato novo): continua indo, com o CNPJ conferido", async () => {
  cenario([{ nome: "Distrato.pdf", texto: "irrelevante" }, { nome: "Antigo.pdf", texto: "irrelevante" }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const envios: EnvioConhecido[] = [{ arquivo_nome: "Antigo.pdf", cnpj: DA_EMPRESA, enviado_em: "2026-10-01T00:00:00Z" }];
  const r = await prepararDadosParaEnvio(
    ctx,
    EMPRESA,
    montarDeps({ cadastro: { encontrada: true, cnpj: DA_EMPRESA, ativa: false }, envios })
  );
  assert.equal(r.pronta, true);
  assert.equal(r.motivo, MOTIVO_PRONTA_DOC_NOVO);
});

test("documento novo numa empresa já enviada: CNPJ do envio anterior DIFERENTE do cadastro → bloqueada", async () => {
  cenario([{ nome: "Novo.pdf", texto: "irrelevante" }, { nome: "Antigo.pdf", texto: "irrelevante" }], { [SINDICATO]: "OUTRA EMPRESA S/A" });
  const envios: EnvioConhecido[] = [{ arquivo_nome: "Antigo.pdf", cnpj: SINDICATO, enviado_em: "2026-10-01T00:00:00Z" }];
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), envios }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.equal(r.cnpj, null);
  assert.match(r.status, /o CNPJ usado nos envios anteriores \(62\.811\.096\/0001-25\) não é o CNPJ desta empresa/);
  assert.deepEqual(consultasAoZen, []);
});

test("memória da busca: a segunda tentativa não relê o documento que só citava outros CNPJs, e continua 'ERRADO'", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}` }], { [SINDICATO]: "OUTRA EMPRESA S/A" });
  const memoria = new Map<string, BuscaParcial>();
  // A 1ª tentativa termina no ERRADO (resultado final) e DEIXA guardado o que o documento citava.
  const primeira = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.match(primeira.status, /puxando CNPJ ERRADO/);
  assert.equal(baixados.length, 1);
  assert.deepEqual(memoria.get("576")?.documentos.map((d) => d.cnpjs_lidos), [[SINDICATO]]);
  assert.equal(memoria.get("576")?.passos, 0, "resultado final: a contagem de tentativas volta a zero");

  baixados = [];
  const segunda = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, [], "não relê o PDF que já se sabe que cita só outros CNPJs");
  assert.equal(segunda.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.match(segunda.status, /puxando CNPJ ERRADO: o robô leu 62\.811\.096\/0001-25 em "Contrato Social\.pdf"/);
});

test("memória da busca: se o cadastro passou a ser um CNPJ que o documento cita, ele é relido e vale", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}. Empresa ${DA_EMPRESA}.` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const memoria = new Map<string, BuscaParcial>([
    [
      "576",
      {
        documentos: [
          {
            id: "id-0",
            nome: "Contrato Social.pdf",
            modificado_em: "2026-01-01T00:00:00Z",
            problema: "Contrato Social.pdf: li o CNPJ ...",
            escaneado: false,
            cnpjs_lidos: [SINDICATO, DA_EMPRESA],
            leitura_versao: VERSAO_LEITURA,
          },
        ],
        vencedor: null,
        passos: 1,
        atualizado_em: new Date().toISOString(),
      },
    ],
  ]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-0"]);
  assert.equal(r.pronta, true);
  assert.equal(r.cnpj, DA_EMPRESA);
});

// ------------------------------------------------------------------
// Segunda leitura do OCR (análise automática de layout)
// ------------------------------------------------------------------

const comRelogioFalso = async (corpo: () => Promise<void>) => {
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  relogioFalso = true;
  try {
    await corpo();
  } finally {
    relogioFalso = false;
    mock.timers.reset();
  }
};

test("escaneado: a 1ª leitura perde o campo do CNPJ, a 2ª acha o do cadastro → usa o do cadastro (caso da 302)", async () => {
  cenario(
    [
      { nome: "Req. Empresario Constituição.pdf", texto: `Autenticação GRÁFICA MUTO LTDA - C.N.P.J. ${SINDICATO}`, escaneado: true, segundoTexto: "" },
      {
        nome: "Req. de Empresario 19.12.16.pdf",
        texto: "NÚMERO DE INSCRIÇÃO NO CNPJ\nA 1 O O",
        escaneado: true,
        segundoTexto: `NÚMERO DE INSCRIÇÃO NO CNPJ\n${DA_EMPRESA} Permanece inalterado`,
      },
    ],
    { [SINDICATO]: "GRÁFICA", [DA_EMPRESA]: "EMPRESA TESTE LTDA" }
  );
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, true);
  assert.equal(r.motivo, MOTIVO_PRONTA);
  assert.equal(r.cnpj, DA_EMPRESA);
  assert.equal(r.documentoCnpjOrigem, "Req. de Empresario 19.12.16.pdf");
  assert.deepEqual(consultasAoZen, ["11222333000181"], "o Zen só é consultado com o CNPJ da empresa, nunca com o da gráfica");
  assert.ok(segundasLeituras.includes("id-1"));
});

test("segunda leitura que só acha CNPJ de OUTRA empresa: continua 'CNPJ ERRADO' (e o status cita o que foi lido)", async () => {
  cenario(
    [{ nome: "Req.pdf", texto: "lixo sem número", escaneado: true, segundoTexto: `Sócia ${SOCIA}` }],
    { [SOCIA]: "OUTRO CLIENTE" }
  );
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.equal(r.cnpj, null);
  assert.match(r.status, /puxando CNPJ ERRADO: o robô leu 28\.107\.999\/0001-91 em "Req\.pdf"/);
  assert.deepEqual(consultasAoZen, []);
});

test("número parecido com o do cadastro (1 dígito trocado) NÃO é aceito: só vale CNPJ IGUAL ao do cadastro", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: `CNPJ ${INVALIDO}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.equal(r.cnpj, null);
  assert.doesNotMatch(r.status, /puxando CNPJ ERRADO/);
  assert.match(r.status, /não passa na conferência dos dígitos verificadores/);
  assert.deepEqual(consultasAoZen, []);
});

test("escaneado sem número nas duas leituras: 'CNPJ NÃO ENCONTRADO' comum (sem 'ERRADO'), segunda leitura feita uma vez", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: "mais lixo" }]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.doesNotMatch(r.status, /ERRADO/);
  assert.deepEqual(segundasLeituras, ["id-0"]);
});

test("documento com texto nativo (não escaneado): não há segunda leitura", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}`, escaneado: false, segundoTexto: DA_EMPRESA }]);
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.deepEqual(segundasLeituras, []);
  assert.match(r.status, /puxando CNPJ ERRADO/);
});

test("escaneado que JÁ confirma o CNPJ do cadastro na 1ª leitura: não gasta a segunda", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}`, escaneado: true }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
  assert.equal(r.pronta, true);
  assert.deepEqual(segundasLeituras, []);
});

test("sem referência (empresa fora do cadastro): não há segunda leitura (nada pra confirmar)", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: DA_EMPRESA }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false } }));
  assert.deepEqual(segundasLeituras, []);
  assert.equal(r.pronta, false);
});

test("a segunda leitura falhar não derruba a busca: vale a 1ª, o motivo aparece no status e ela não se repete", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: DA_EMPRESA }]);
  segundaLeituraFalha = true;
  const memoria = new Map<string, BuscaParcial>();
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.match(r.status, /a segunda leitura do OCR falhou \(o tesseract caiu\)/);
  assert.deepEqual(segundasLeituras, ["id-0"]);
});

test("sem tempo depois da 1ª leitura: adia o documento (não o marca como lido sem CNPJ) e a tentativa seguinte faz a segunda leitura", async () => {
  await comRelogioFalso(async () => {
    cenario(
      [
        { nome: "Certidao de inteiro teor.pdf", texto: `Sócia ${SOCIA}`, escaneado: true, segundoTexto: "" },
        { nome: "Alteracao contratual.pdf", texto: "lixo", escaneado: true, segundoTexto: `Empresa ${DA_EMPRESA}`, msNaLeitura: 41_000 },
      ],
      { [DA_EMPRESA]: "EMPRESA TESTE LTDA" }
    );
    const memoria = new Map<string, BuscaParcial>();
    const a = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
    assert.equal(a.motivo, MOTIVO_BUSCA_INCOMPLETA);
    assert.deepEqual(segundasLeituras, ["id-0"], "o 2º documento ficou sem a segunda leitura por falta de tempo");
    const guardado = memoria.get("576");
    assert.ok(guardado);
    assert.deepEqual(guardado.documentos.map((d) => d.id), ["id-0"], "só o 1º documento foi registrado como lido");
    assert.equal(guardado.documentos[0].leitura_completa, true);
    assert.deepEqual(guardado.documentos[0].cnpjs_lidos, [SOCIA]);

    baixados = [];
    segundasLeituras = [];
    const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
    assert.deepEqual(baixados, ["id-1"], "o 1º já está na memória; só o 2º é relido");
    assert.deepEqual(segundasLeituras, ["id-1"]);
    assert.equal(b.pronta, true);
    assert.equal(b.cnpj, DA_EMPRESA);
  });
});

test("sem tempo, mas é o PRIMEIRO documento lido neste passo: a segunda leitura roda mesmo assim (senão a busca não sairia do lugar)", async () => {
  await comRelogioFalso(async () => {
    cenario(
      [{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: `Empresa ${DA_EMPRESA}`, msNaLeitura: 41_000 }],
      { [DA_EMPRESA]: "EMPRESA TESTE LTDA" }
    );
    const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA) }));
    assert.deepEqual(segundasLeituras, ["id-0"]);
    assert.equal(r.pronta, true);
    assert.equal(r.cnpj, DA_EMPRESA);
  });
});

const doc0 = (extra: Partial<DocTentado>): DocTentado => ({
  id: "id-0",
  nome: "Req.pdf",
  modificado_em: "2026-01-01T00:00:00Z",
  problema: "Req.pdf: tinha texto, mas não encontrei um CNPJ nele",
  escaneado: true,
  leitura_versao: VERSAO_LEITURA,
  ...extra,
});
const memoriaCom = (d: DocTentado) =>
  new Map<string, BuscaParcial>([["576", { documentos: [d], vencedor: null, passos: 1, atualizado_em: new Date().toISOString() }]]);

test("memória: escaneado guardado só com a 1ª leitura é relido (uma vez) quando há referência", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: `Empresa ${DA_EMPRESA}` }], { [DA_EMPRESA]: "EMPRESA TESTE LTDA" });
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria: memoriaCom(doc0({})) }));
  assert.deepEqual(baixados, ["id-0"]);
  assert.deepEqual(segundasLeituras, ["id-0"]);
  assert.equal(r.pronta, true);
});

test("memória: escaneado JÁ lido pelas duas leituras não é relido", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: `Empresa ${DA_EMPRESA}` }]);
  const r = await prepararDadosParaEnvio(
    ctx,
    EMPRESA,
    montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria: memoriaCom(doc0({ leitura_completa: true })) })
  );
  assert.deepEqual(baixados, []);
  assert.deepEqual(segundasLeituras, []);
  assert.equal(r.pronta, false);
});

test("memória: documento que falhou ao ler (leitura_completa) e o que tem texto nativo não são relidos", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: DA_EMPRESA }]);
  await prepararDadosParaEnvio(
    ctx,
    EMPRESA,
    montarDeps({
      cadastro: cadastro(DA_EMPRESA),
      memoria: memoriaCom(doc0({ problema: "Req.pdf: erro ao ler (PDF corrompido)", leitura_completa: true })),
    })
  );
  assert.deepEqual(baixados, []);
  await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria: memoriaCom(doc0({ escaneado: false })) }));
  assert.deepEqual(baixados, [], "texto nativo já foi lido por inteiro na 1ª leitura");
});

test("memória: sem referência (empresa fora do cadastro) o escaneado guardado não é relido", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: DA_EMPRESA }]);
  await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false }, memoria: memoriaCom(doc0({})) }));
  assert.deepEqual(baixados, []);
  assert.deepEqual(segundasLeituras, []);
});

// ------------------------------------------------------------------
// Reaproveitar a leitura: arquivo igual + cadastro igual = não baixa nem faz OCR de novo
// ------------------------------------------------------------------

const DIAS = 24 * 3_600_000;
const CONTRATO_COM_CNPJ = { nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}.`, escaneado: true };
const ZEN_OK = { [DA_EMPRESA]: "EMPRESA TESTE LTDA" };

/** Roda a 1ª varredura (guarda a memória) e zera os contadores pra medir só a 2ª. */
async function primeiraVarredura(opcoes: { cadastro: CadastroEmpresa; memoria: Map<string, BuscaParcial> }) {
  const r = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps(opcoes));
  baixados = [];
  consultasAoZen = [];
  segundasLeituras = [];
  return r;
}

test("reaproveitar: achou o CNPJ — a varredura seguinte não baixa nada, dá o mesmo resultado e ainda consulta o Zen", async () => {
  cenario([CONTRATO_COM_CNPJ], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.pronta, true);
  const guardado = memoria.get("576")?.vencedor;
  assert.equal(guardado?.cnpj, DA_EMPRESA);
  assert.equal(guardado?.leitura_versao, VERSAO_LEITURA);

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, [], "nada baixado: o arquivo e o cadastro são os mesmos");
  assert.deepEqual(segundasLeituras, []);
  assert.equal(b.pronta, true);
  assert.equal(b.motivo, MOTIVO_PRONTA);
  assert.equal(b.cnpj, DA_EMPRESA);
  assert.equal(b.documentoCnpjOrigem, "Contrato Social.pdf");
  assert.equal(b.qtdDocumentosEscaneados, 1, "o 'parece escaneado' também vem do guardado");
  assert.deepEqual(b.documentosEscaneados, ["Contrato Social.pdf"]);
  assert.deepEqual(consultasAoZen, [DA_EMPRESA.replace(/\D/g, "")], "o cliente no Zen é conferido de novo (pode ter mudado)");
});

test("reaproveitar: o cliente no Zen continua sendo conferido a cada varredura (ele pode ser cadastrado depois)", async () => {
  cenario([CONTRATO_COM_CNPJ], {});
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.motivo, MOTIVO_CLIENTE_NAO_CADASTRADO);

  clientesDoZen.set(DA_EMPRESA.replace(/\D/g, ""), "EMPRESA TESTE LTDA"); // alguém cadastrou o cliente no Zen
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, []);
  assert.equal(b.pronta, true, "sem reler o PDF, a empresa passa a PRONTA assim que o cliente existe no Zen");
});

test("reaproveitar: o arquivo foi trocado no SharePoint (outra data) — é lido de novo", async () => {
  cenario([CONTRATO_COM_CNPJ], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  arquivosDaPasta[0].modificadoEm = "2026-03-01T00:00:00Z";
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-0"]);
  assert.equal(b.pronta, true);
  assert.equal(memoria.get("576")?.vencedor?.modificado_em, "2026-03-01T00:00:00Z", "guarda a versão nova");
});

test("reaproveitar: o CNPJ do cadastro mudou — o guardado não serve e o documento é lido de novo", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}. Sócia ${SOCIA}.` }], { [DA_EMPRESA]: "A", [SOCIA]: "B" });
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.cnpj, DA_EMPRESA);
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(SOCIA), memoria }));
  assert.deepEqual(baixados, ["id-0"]);
  assert.equal(b.cnpj, SOCIA);
});

test("reaproveitar: CNPJ lido SEM referência não é usado depois que o cadastro aparece (nunca vai pro cliente errado)", async () => {
  cenario([{ nome: "Contrato Social.pdf", texto: `Sindicato ${SINDICATO}. Empresa ${DA_EMPRESA}.` }], {
    [SINDICATO]: "OUTRA EMPRESA S/A",
    [DA_EMPRESA]: "EMPRESA TESTE LTDA",
  });
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: { encontrada: false }, memoria });
  assert.equal(a.motivo, MOTIVO_CNPJ_NAO_CONFIRMADO);
  assert.equal(a.cnpj, SINDICATO, "sem referência vale o primeiro CNPJ válido — que aqui é o do sindicato");

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-0"], "o cadastro agora existe e é outro: lê de novo");
  assert.equal(b.pronta, true);
  assert.equal(b.cnpj, DA_EMPRESA);
  assert.ok(!consultasAoZen.includes(SINDICATO.replace(/\D/g, "")), "o cliente do sindicato nunca é o escolhido");
});

test("reaproveitar: sem referência (fora do cadastro), o CNPJ guardado vale e o resultado é o mesmo", async () => {
  cenario([CONTRATO_COM_CNPJ], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: { encontrada: false }, memoria });
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: { encontrada: false }, memoria }));
  assert.deepEqual(baixados, []);
  assert.equal(b.motivo, a.motivo);
  assert.equal(b.status, a.status);
  assert.equal(b.cnpj, a.cnpj);
});

test("reaproveitar: guardado por uma versão antiga do leitor (ou sem versão) é ignorado", async () => {
  for (const versao of [undefined, VERSAO_LEITURA - 1]) {
    cenario([CONTRATO_COM_CNPJ], ZEN_OK);
    const memoria = new Map<string, BuscaParcial>();
    await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
    const g = memoria.get("576")!;
    memoria.set("576", { ...g, vencedor: { ...g.vencedor!, leitura_versao: versao } });
    await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
    assert.deepEqual(baixados, ["id-0"], `versão ${versao}: lê de novo`);
    assert.equal(memoria.get("576")?.vencedor?.leitura_versao, VERSAO_LEITURA, "e guarda com a versão de hoje");
  }
});

test("reaproveitar: passou da validade (90 dias) — lê de novo, como revalidação de segurança", async () => {
  cenario([CONTRATO_COM_CNPJ], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  const g = memoria.get("576")!;

  memoria.set("576", { ...g, atualizado_em: new Date(Date.now() - 89 * DIAS).toISOString() });
  await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, [], "89 dias: ainda vale");

  memoria.set("576", { ...g, atualizado_em: new Date(Date.now() - 91 * DIAS).toISOString() });
  await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-0"], "91 dias: lê de novo");
});

test("reaproveitar: 'li tudo e não achei' também fica guardado — a varredura seguinte não baixa nada e dá o mesmo status", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: "mais lixo" }]);
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.equal(memoria.get("576")?.documentos.length, 1);
  assert.equal(memoria.get("576")?.passos, 0);

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, [], "nem baixa o PDF, nem faz as duas leituras do OCR");
  assert.deepEqual(segundasLeituras, []);
  assert.equal(b.motivo, a.motivo);
  assert.equal(b.status, a.status);
  assert.equal(b.qtdDocumentosEscaneados, 1);
});

test("reaproveitar: apareceu um documento NOVO — só ele é lido, e o CNPJ que ele traz vale", async () => {
  cenario([{ nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: "mais lixo" }], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  arquivosDaPasta.push({ id: "id-1", nome: "Alteracao contratual.pdf", modificadoEm: "2026-02-01T00:00:00Z" });
  textosPorId.set("id-1", `Empresa ${DA_EMPRESA}`);

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-1"], "o que já foi lido sem CNPJ não é aberto de novo");
  assert.equal(b.pronta, true);
  assert.equal(b.cnpj, DA_EMPRESA);
  assert.equal(b.documentoCnpjOrigem, "Alteracao contratual.pdf");
});

test("reaproveitar: 'li tudo e não achei' + arquivo alterado — só o alterado é lido de novo", async () => {
  cenario(
    [
      { nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: "mais lixo" },
      { nome: "Outro.pdf", texto: "outro lixo" },
    ],
    ZEN_OK
  );
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  arquivosDaPasta[1].modificadoEm = "2026-04-01T00:00:00Z";
  textosPorId.set("id-1", `Agora tem o CNPJ ${DA_EMPRESA}`);
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-1"]);
  assert.equal(b.pronta, true);
});

test("reaproveitar: o 'parece escaneado' dos outros documentos também não obriga a baixá-los de novo", async () => {
  cenario(
    [
      { nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}.` },
      { nome: "Aditivo 1.pdf", texto: "x", escaneado: true },
      { nome: "Aditivo 2.pdf", texto: "y" },
    ],
    ZEN_OK
  );
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.documentoCnpjOrigem, "Contrato Social.pdf");
  assert.deepEqual(a.documentosEscaneados, ["Aditivo 1.pdf"]);

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, [], "nenhum dos três é baixado");
  assert.deepEqual(b.documentosEscaneados, ["Aditivo 1.pdf"]);
  assert.equal(b.qtdDocumentosEscaneados, 1);
});

test("reaproveitar: a checagem de 'escaneado' guardada NÃO conta como documento lido sem CNPJ (se o vencedor sumir, os outros são lidos)", async () => {
  cenario(
    [
      { nome: "Contrato Social.pdf", texto: `Empresa ${DA_EMPRESA}.` },
      { nome: "Aditivo.pdf", texto: `Aditivo da empresa ${DA_EMPRESA}.` },
    ],
    ZEN_OK
  );
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.ok(memoria.get("576")?.documentos.every((d) => d.apenas_escaneio));

  // alguém apagou o contrato social da pasta: o aditivo tem que ser lido (não pode ser dado como "já lido sem CNPJ")
  arquivosDaPasta.splice(0, 1);
  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-1"]);
  assert.equal(b.pronta, true);
  assert.equal(b.documentoCnpjOrigem, "Aditivo.pdf");
});

test("reaproveitar: busca que desistiu (tentativas esgotadas) guarda o que leu e a varredura seguinte continua nos documentos que faltam", async () => {
  cenario(
    [
      { nome: "Req.pdf", texto: "lixo", escaneado: true, segundoTexto: "mais lixo" },
      { nome: "Outro.pdf", texto: `Empresa ${DA_EMPRESA}` },
    ],
    ZEN_OK
  );
  const memoria = new Map<string, BuscaParcial>([
    ["576", { documentos: [doc0({ leitura_completa: true })], vencedor: null, passos: 8, atualizado_em: new Date().toISOString() }],
  ]);
  const a = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.match(a.status, /desisti depois de 8 tentativas/);
  assert.deepEqual(baixados, []);
  assert.equal(memoria.get("576")?.passos, 0, "a contagem recomeça");
  assert.equal(memoria.get("576")?.documentos.length, 1, "e o que foi lido continua guardado");

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, ["id-1"], "só o documento que ainda não tinha sido lido");
  assert.equal(b.pronta, true);
});

test("reaproveitar: sem nada guardado de novo, a varredura não escreve no banco à toa", async () => {
  cenario([CONTRATO_COM_CNPJ], ZEN_OK);
  const memoria = new Map<string, BuscaParcial>();
  await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  const deps = montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria });
  let gravacoes = 0;
  const gravar = deps.salvarBuscaParcial;
  deps.salvarBuscaParcial = async (...args) => {
    gravacoes++;
    return gravar(...args);
  };
  await prepararDadosParaEnvio(ctx, EMPRESA, deps);
  assert.equal(gravacoes, 0);
});

test("reaproveitar: documento que falhou ao ler e o que só tinha um CNPJ inválido também não são lidos de novo (mesmo arquivo)", async () => {
  cenario([
    { nome: "Corrompido.pdf", texto: "__ERRO_AO_LER__" },
    { nome: "Ruim.pdf", texto: `CNPJ ${INVALIDO}` },
  ]);
  const memoria = new Map<string, BuscaParcial>();
  const a = await primeiraVarredura({ cadastro: cadastro(DA_EMPRESA), memoria });
  assert.equal(a.motivo, MOTIVO_CNPJ_NAO_ENCONTRADO);
  assert.match(a.status, /Corrompido\.pdf: erro ao ler \(PDF corrompido\)/);
  assert.match(a.status, /Ruim\.pdf: li o CNPJ 11\.222\.333\/0001-82, mas ele não passa na conferência/);

  const b = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.deepEqual(baixados, []);
  assert.equal(b.status, a.status);
  assert.ok(memoria.get("576")?.documentos.every((d) => d.leitura_versao === VERSAO_LEITURA));
});
