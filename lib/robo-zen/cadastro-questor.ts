// CNPJ da empresa no cadastro do Questor — a referência pra conferir o CNPJ que o robô
// lê nos documentos (ver conferencia-cnpj.ts).
//
// Usa a lista completa de empresas (`getEmpresas(false)`: inclui as encerradas, que
// também têm pasta no SharePoint). A lista é a mesma pra todas as empresas, então fica
// em memória por alguns minutos: a varredura processa uma empresa por chamada e não
// precisa buscar a lista inteira de novo a cada uma. Se a chamada falhar, o erro SOBE
// (quem chama decide: falha passageira tenta de novo, as demais viram "ERRO") — nunca
// se assume "sem cadastro" por causa de uma falha.

import { getEmpresas } from "../questor";
import { indexarCadastro, normalizarCodigoEmpresa, type CadastroEmpresa } from "./conferencia-cnpj";

/** Por quanto tempo a lista em memória vale. */
export const VALIDADE_CADASTRO_MS = 10 * 60_000;

/** Quanto esperar o Questor responder (a função da Vercel é morta aos 60 s; sem este limite uma
 * API lenta travaria o passo inteiro). Estourar vira falha PASSAGEIRA: a tentativa se repete. */
export const TEMPO_LIMITE_CADASTRO_MS = 20_000;

function comLimiteDeTempo<T>(promessa: Promise<T>): Promise<T> {
  let relogio: ReturnType<typeof setTimeout>;
  const estouro = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(
      () => rejeitar(new Error(`timeout: o Questor não respondeu o cadastro de empresas em ${TEMPO_LIMITE_CADASTRO_MS / 1000}s`)),
      TEMPO_LIMITE_CADASTRO_MS
    );
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(relogio));
}

let guardado: { em: number; porCodigo: Map<string, CadastroEmpresa> } | null = null;
let emAndamento: Promise<Map<string, CadastroEmpresa>> | null = null;

async function carregar(): Promise<Map<string, CadastroEmpresa>> {
  if (guardado && Date.now() - guardado.em < VALIDADE_CADASTRO_MS) return guardado.porCodigo;
  // Várias empresas pedindo ao mesmo tempo (passos concorrentes) esperam a mesma chamada.
  if (!emAndamento) {
    emAndamento = comLimiteDeTempo(getEmpresas(false))
      .then((r) => {
        const porCodigo = indexarCadastro(Array.isArray(r?.dados) ? r.dados : []);
        // Lista vazia = resposta estranha, não "nenhuma empresa existe": falha em vez de
        // bloquear todas as empresas por engano.
        if (porCodigo.size === 0) throw new Error("o Questor devolveu o cadastro de empresas vazio");
        guardado = { em: Date.now(), porCodigo };
        return porCodigo;
      })
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}

/** O cadastro de uma empresa no Questor (código da pasta). Lança se não conseguir consultar. */
export async function cadastroDaEmpresa(codigo: string): Promise<CadastroEmpresa> {
  const porCodigo = await carregar();
  return porCodigo.get(normalizarCodigoEmpresa(codigo)) ?? { encontrada: false };
}
