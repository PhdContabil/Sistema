// "O que já foi enviado ao Zen e o que é novo" — lógica PURA (sem banco, sem
// SharePoint, sem nenhum import), pra poder ser testada de ponta a ponta e
// também importada pela tela (navegador) sem puxar código só-de-servidor.
//
// Quem alimenta isto é `prepararDadosParaEnvio` (lib/robo-zen/preparar-empresa.ts):
// ela lista os documentos elegíveis da empresa no SharePoint e pergunta ao
// registro permanente de envios (tabela robo_zen_envios) o que já foi mandado.
//
// Regra de identidade: o MESMO critério da própria tabela — (código da
// empresa, nome do arquivo), igualdade exata. É a chave única de
// robo_zen_envios e a que o envio em lote já usa pra pular o que foi enviado;
// manter a mesma regra aqui evita "a varredura diz uma coisa e o envio faz outra".

/** Motivo: tudo o que é elegível na pasta de Contratos já foi enviado. */
export const MOTIVO_JA_ENVIADA = "JÁ ENVIADA (sem documento novo)";

/** Motivo: tudo já foi enviado, mas algum arquivo foi mexido no SharePoint
 * DEPOIS do envio. Só avisa — nunca reenvia sozinho (ver `classificarEnvios`). */
export const MOTIVO_JA_ENVIADA_ALTERADA = "JÁ ENVIADA (arquivo alterado depois do envio — conferir)";

/** Motivo: a empresa já tinha envio antes e apareceu documento novo — só o novo vai. */
export const MOTIVO_PRONTA_DOC_NOVO = "PRONTA (documento novo)";

/** Margem pra considerar um arquivo "alterado depois do envio": o relógio do
 * SharePoint e o do banco não são o mesmo, e salvar/sincronizar logo em
 * seguida não conta como uma alteração de verdade. */
export const TOLERANCIA_ALTERACAO_MS = 60_000;

/** Linha de robo_zen_envios (só o que importa aqui). */
export interface EnvioConhecido {
  arquivo_nome: string;
  cnpj: string;
  enviado_em: string;
}

export interface DocumentoClassificavel {
  nome: string;
  /** lastModifiedDateTime do arquivo no SharePoint (ISO), quando o Graph informou. */
  modificadoEm?: string | null;
}

export interface ClassificacaoEnvios<D extends DocumentoClassificavel> {
  /** Elegíveis que ainda NÃO foram enviados — são os únicos que podem ir ao Zen. */
  novos: D[];
  /** Elegíveis que já constam como enviados. */
  jaEnviados: D[];
  /** Subconjunto de `jaEnviados` mexidos no SharePoint depois do envio. Nunca
   * são reenviados: o registro (e a chave única) trata o nome como já enviado;
   * é uma pessoa quem decide se a versão nova precisa ir ao Zen. */
  alterados: D[];
  /** CNPJ do envio mais recente da empresa (quando dá pra confiar nele). */
  cnpjConhecido: string | null;
  /** A empresa tem algum envio registrado? */
  temHistorico: boolean;
}

function soDigitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/** Date.parse que devolve null em vez de NaN. */
function tempo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/**
 * Separa os documentos elegíveis de uma empresa entre "novos" e "já
 * enviados" a partir dos envios registrados dela.
 *
 * - Compara o NOME do arquivo (igualdade exata, como a chave única da tabela).
 * - Não altera nem reordena os arrays recebidos: a ordem original se mantém
 *   dentro de cada grupo.
 * - `alterados`: documento já enviado cujo `modificadoEm` é mais de
 *   `TOLERANCIA_ALTERACAO_MS` depois do `enviado_em`. Se alguma das duas datas
 *   faltar ou não for uma data válida, NÃO conta como alterado (na dúvida, não
 *   levanta alarme falso).
 * - `cnpjConhecido`: o CNPJ (com 14 dígitos) do envio mais recente; vazio ou
 *   malformado é ignorado.
 */
export function classificarEnvios<D extends DocumentoClassificavel>(
  elegiveis: D[],
  envios: EnvioConhecido[]
): ClassificacaoEnvios<D> {
  // Se o mesmo nome aparecer mais de uma vez (a chave única impede, mas não
  // custa ser robusto), vale o envio mais recente.
  const porNome = new Map<string, EnvioConhecido>();
  for (const e of envios) {
    const atual = porNome.get(e.arquivo_nome);
    if (!atual || (tempo(e.enviado_em) ?? 0) >= (tempo(atual.enviado_em) ?? 0)) porNome.set(e.arquivo_nome, e);
  }

  const novos: D[] = [];
  const jaEnviados: D[] = [];
  const alterados: D[] = [];
  for (const doc of elegiveis) {
    const envio = porNome.get(doc.nome);
    if (!envio) {
      novos.push(doc);
      continue;
    }
    jaEnviados.push(doc);
    const modificado = tempo(doc.modificadoEm);
    const enviado = tempo(envio.enviado_em);
    if (modificado !== null && enviado !== null && modificado > enviado + TOLERANCIA_ALTERACAO_MS) {
      alterados.push(doc);
    }
  }

  const maisRecentePrimeiro = [...envios].sort((a, b) => (tempo(b.enviado_em) ?? 0) - (tempo(a.enviado_em) ?? 0));
  const comCnpj = maisRecentePrimeiro.find((e) => soDigitos(e.cnpj).length === 14);

  return {
    novos,
    jaEnviados,
    alterados,
    cnpjConhecido: comCnpj ? comCnpj.cnpj.trim() : null,
    temHistorico: envios.length > 0,
  };
}
