// Paralegal · Procurações (procuração eletrônica no e-CAC). SERVIDOR.
//
// Carteira = empresas ativas do Questor, cruzadas por CNPJ com a tabela
// procuracoes (docs/procuracoes-migration.sql). A consulta ao SERPRO
// (PROCURACOES/OBTERPROCURACAO41) só acontece por clique, uma empresa por
// requisição; o lote é um laço no navegador.

import { getEmpresas, hasApiKey } from "./questor";
import { autenticar, consumir, dadosDe, participante, textoMensagens } from "./serpro/integra-contador";
import { carregarCredenciais, db, registrarChamada, soDigitos } from "./serpro/servidor";
import { interpretarRetorno, type ServicoProcuracao } from "./procuracoes-calculo";

export { soDigitos };

export interface LinhaProcuracao {
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  ativa_questor: boolean;
  situacao: string | null;
  data_fim: string | null;
  servicos: ServicoProcuracao[] | null;
  mensagem: string | null;
  ultima_consulta: string | null;
}

type Registro = Omit<LinhaProcuracao, "codigoempresa" | "ativa_questor">;

const vazio = (cnpj: string): LinhaProcuracao => ({
  cnpj, razao_social: null, codigoempresa: null, ativa_questor: false,
  situacao: null, data_fim: null, servicos: null, mensagem: null, ultima_consulta: null,
});

export async function listarCarteira(): Promise<{ linhas: LinhaProcuracao[]; avisoCarteira: string | null }> {
  const { data, error } = await db().from("procuracoes")
    .select("cnpj, razao_social, situacao, data_fim, servicos, mensagem, ultima_consulta");
  if (error) throw new Error(error.message);
  const porCnpj = new Map<string, Registro>((data as unknown as Registro[]).map((r) => [r.cnpj, r]));

  let avisoCarteira: string | null = null;
  const linhas: LinhaProcuracao[] = [];
  const vistos = new Set<string>();

  if (hasApiKey()) {
    try {
      const { dados } = await getEmpresas(true);
      for (const e of dados) {
        const cnpj = soDigitos(e.cnpj);
        if (cnpj.length !== 14 || vistos.has(cnpj)) continue;
        vistos.add(cnpj);
        const r = porCnpj.get(cnpj);
        linhas.push({ ...vazio(cnpj), ...(r ?? {}), razao_social: e.nome ?? r?.razao_social ?? null, codigoempresa: e.codigoempresa, ativa_questor: true });
      }
    } catch (e) {
      avisoCarteira = `Não consegui ler a carteira do Questor (${e instanceof Error ? e.message : "erro"}). Mostrando só as já consultadas.`;
    }
  } else {
    avisoCarteira = "API Questor não configurada: mostrando só as empresas já consultadas.";
  }
  for (const r of porCnpj.values()) {
    if (!vistos.has(r.cnpj)) linhas.push({ ...vazio(r.cnpj), ...r, codigoempresa: null, ativa_questor: false });
  }
  linhas.sort((a, b) => (a.razao_social ?? "").localeCompare(b.razao_social ?? "", "pt-BR"));
  return { linhas, avisoCarteira };
}

/** Consulta a procuração de UMA empresa no e-CAC (chamada ao SERPRO) e grava. */
export async function consultarProcuracao(cnpjRaw: string, razaoSocial: string | null, porEmail: string) {
  const cnpj = soDigitos(cnpjRaw);
  if (cnpj.length !== 14) throw new Error("CNPJ inválido.");

  const cred = await carregarCredenciais();
  const escritorio = soDigitos(cred.contratante_cnpj);
  const tokens = await autenticar(cred);
  const contratante = participante(escritorio);

  const r = await consumir({
    tokens, metodo: "Consultar", contratante, contribuinte: participante(cnpj),
    pedidoDados: {
      idSistema: "PROCURACOES", idServico: "OBTERPROCURACAO41", versaoSistema: "1",
      dados: JSON.stringify({ outorgante: cnpj, tipoOutorgante: "2", outorgado: escritorio, tipoOutorgado: "2" }),
    },
  });

  const agora = new Date().toISOString();
  const ok = r.httpStatus >= 200 && r.httpStatus < 300;
  const base = { cnpj, ultima_consulta: agora, updated_at: agora, ...(razaoSocial ? { razao_social: razaoSocial } : {}) };
  const registro: Record<string, unknown> & { situacao: string; mensagem: string | null } = ok
    ? { ...base, ...interpretarRetorno(dadosDe(r) ?? [], agora.slice(0, 10)), mensagem: null }
    : { ...base, situacao: "erro", mensagem: `HTTP ${r.httpStatus}. ${textoMensagens(r)}`.trim() };

  const { error } = await db().from("procuracoes").upsert(registro, { onConflict: "cnpj" });
  if (error) throw new Error(error.message);
  await registrarChamada("serpro-procuracoes", "Consulta Procuração", cnpj, ok,
    { situacao: registro.situacao, mensagem: registro.mensagem, por: porEmail });

  return { ok, cnpj, situacao: registro.situacao, data_fim: (registro.data_fim as string | null) ?? null, mensagem: registro.mensagem };
}
