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
import type { BuscaParcial, DocTentado, DocVencedor } from "./busca-parcial";
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
      const texto = textosPorId.get(bytes.toString()) ?? "";
      const m = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
      const { cnpjValido } = await import("./cnpj");
      return { cnpj: m.find((c) => cnpjValido(c)) ?? m[0] ?? null, textoBruto: texto, pareceEscaneado: false };
    },
    pdfPareceEscaneado: async () => false,
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
before(async () => {
  const m = await import("./preparar-empresa");
  ({
    prepararDadosParaEnvio,
    MOTIVO_CNPJ_NAO_CONFIRMADO,
    MOTIVO_CNPJ_NAO_ENCONTRADO,
    MOTIVO_CLIENTE_NAO_CADASTRADO,
    MOTIVO_ERRO,
    MOTIVO_PRONTA,
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
    limparBuscaParcial: async (codigo) => {
      memoria.delete(codigo);
    },
    cadastroDaEmpresa: async () => {
      if (opcoes.cadastro instanceof Error) throw opcoes.cadastro;
      return opcoes.cadastro;
    },
  };
}

function cenario(docs: { nome: string; texto: string }[], zen: Record<string, string> = {}) {
  arquivosDaPasta.length = 0;
  textosPorId.clear();
  baixados = [];
  consultasAoZen = [];
  clientesDoZen = new Map(Object.entries(zen).map(([cnpj, nome]) => [cnpj.replace(/\D/g, ""), nome]));
  docs.forEach((d, i) => {
    const id = `id-${i}`;
    arquivosDaPasta.push({ id, nome: d.nome, modificadoEm: "2026-01-01T00:00:00Z" });
    textosPorId.set(id, d.texto);
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
  // 1ª tentativa termina no ERRADO e (como é resultado final) limpa a memória; força uma memória
  // como a de uma busca interrompida, com o que o documento citava.
  const primeira = await prepararDadosParaEnvio(ctx, EMPRESA, montarDeps({ cadastro: cadastro(DA_EMPRESA), memoria }));
  assert.match(primeira.status, /puxando CNPJ ERRADO/);
  assert.equal(baixados.length, 1);

  memoria.set("576", {
    documentos: [
      {
        id: "id-0",
        nome: "Contrato Social.pdf",
        modificado_em: "2026-01-01T00:00:00Z",
        problema: "Contrato Social.pdf: li o CNPJ 62.811.096/0001-25, mas ele não é o CNPJ desta empresa",
        escaneado: false,
        cnpjs_lidos: [SINDICATO],
      },
    ],
    vencedor: null,
    passos: 1,
    atualizado_em: new Date().toISOString(),
  });
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
