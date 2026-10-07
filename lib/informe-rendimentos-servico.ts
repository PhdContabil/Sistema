// Informe de Rendimentos — orquestração no SERVIDOR: valida a entrada, descobre
// o regime no Tareffa (nunca confia no que o navegador manda) e monta o plano.
// Compartilhado por /calcular e /lancar para os dois decidirem igual.

import {
  InformeInvalido, montarPlano, validarEntrada, ROTULO_REGIME,
  type EntradaInforme, type PlanoInforme, type Regime,
} from "./informe-rendimentos";
import { obterRegimeEmpresa } from "./tareffa-regime";
import { tareffaConfigurado, TareffaError } from "./tareffa-documentos";
import { chaveIdempotencia } from "./informe-rendimentos-log";

export class ErroInforme extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export interface InformePreparado {
  entrada: EntradaInforme;
  regime: Regime;
  regimeDescricao: string | null;
  nomeEmpresa: string | null;
  plano: PlanoInforme;
  chave: string;
  /**
   * Lucro Real só grava de verdade com INFORME_LUCRO_REAL_LIBERADO=1 no
   * servidor: os códigos da ECF para esse regime ainda não foram confirmados.
   * Simular (dry run) continua liberado.
   */
  gravacaoLiberada: boolean;
  motivoBloqueio: string | null;
}

function numero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // Aceita "1.234,56" e "1234.56".
  const s = String(v).trim();
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return n;
}

export async function prepararInforme(corpo: Record<string, unknown>): Promise<InformePreparado> {
  let entrada: EntradaInforme;
  try {
    entrada = validarEntrada({
      codigoempresa: Number(corpo.codigoempresa),
      competencia: String(corpo.competencia ?? ""),
      rendimento: numero(corpo.rendimento),
      demaisReceitas: numero(corpo.demaisReceitas),
      dividendos: numero(corpo.dividendos),
      retencao: numero(corpo.retencao),
    });
  } catch (e) {
    if (e instanceof InformeInvalido) throw new ErroInforme(e.message, 400);
    throw e;
  }

  if (!tareffaConfigurado()) {
    throw new ErroInforme("Tareffa não configurado no servidor — sem ele não há como saber o regime da empresa.", 412);
  }

  let r;
  try {
    r = await obterRegimeEmpresa(entrada.codigoempresa);
  } catch (e) {
    const m = e instanceof TareffaError ? e.message : "falha ao consultar o Tareffa";
    throw new ErroInforme(`Não consegui ler o regime no Tareffa: ${m}`, 502);
  }
  if (!r) {
    throw new ErroInforme(`A empresa ${entrada.codigoempresa} não foi encontrada no Tareffa (Código ERP ${entrada.codigoempresa}-1).`, 404);
  }
  if (!r.regime) {
    throw new ErroInforme(
      r.regimeDescricao
        ? `Regime "${r.regimeDescricao}" não é atendido por esta tela (só Lucro Presumido e Lucro Real).`
        : "A empresa não tem Regime Tributário marcado no Tareffa (Características > 01.Regime Tributário).",
      422
    );
  }

  const plano = montarPlano(entrada, r.regime);
  const realLiberado = process.env.INFORME_LUCRO_REAL_LIBERADO === "1";
  const bloqueado = r.regime === "real" && !realLiberado;

  return {
    entrada, regime: r.regime, regimeDescricao: r.regimeDescricao ?? ROTULO_REGIME[r.regime],
    nomeEmpresa: r.razaoSocial, plano, chave: chaveIdempotencia(entrada, r.regime),
    gravacaoLiberada: !bloqueado,
    motivoBloqueio: bloqueado
      ? "Gravação em Lucro Real ainda bloqueada: os códigos da ECF para esse regime não foram confirmados. Defina INFORME_LUCRO_REAL_LIBERADO=1 no servidor depois de confirmar."
      : null,
  };
}
