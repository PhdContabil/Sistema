// Tipos de processo que deixam de existir (pedido do Paralegal, 27/10/2026) e para onde vão.
// A troca é feita na leitura: vale também para os processos que vêm do Tareffa,
// sem regravar nada e sem a sincronização desfazer.

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export const SERVICOS_AVULSOS = "SERVIÇOS AVULSOS";

/** Tags dos Serviços Avulsos. */
export const TAGS_AVULSOS = [
  "IBGE",
  "Emissão de CLI",
  "Solicitação / Renovação Vigilância Sanitária",
  "Registro / Renovação Conselho de Classe",
] as const;

const ALIAS: Record<string, { tipo: string; tag?: string }> = {
  [norm("Abertura - Parte 1")]: { tipo: "Abertura de Empresa" },
  [norm("Abertura - Parte 2")]: { tipo: "Abertura de Empresa" },
  [norm("Constituição")]: { tipo: "Abertura de Empresa" },
  [norm("Alteração - QSA")]: { tipo: "Alteração contratual" },
  [norm("Cancelamento de CCM")]: { tipo: "Cancelamento" },
  [norm("Cancelamento CCM")]: { tipo: "Cancelamento" },
  [norm("IBGE")]: { tipo: SERVICOS_AVULSOS, tag: "IBGE" },
  [norm("Emissão de CLI")]: { tipo: SERVICOS_AVULSOS, tag: "Emissão de CLI" },
};

/** Tipos que não aparecem mais para escolher. */
export function tipoDescontinuado(nome: string): boolean {
  return !!ALIAS[norm(nome)];
}

/** Tipo atual (e tag, se virou Serviço Avulso) de um nome de tipo antigo. */
export function tipoAtual(nome: string): { tipo: string; tag?: string } {
  return ALIAS[norm(nome || "")] ?? { tipo: nome };
}

/** Aplica o de-para num processo (process e tag). */
export function normalizarTipo<T extends { process: string; tag?: string | null }>(p: T): T {
  const a = ALIAS[norm(p.process || "")];
  if (!a) return p;
  return { ...p, process: a.tipo, tag: p.tag || a.tag || null };
}

export function ehIntegracao(segmento: string | null | undefined, nome: string): boolean {
  return /INTEGRA/i.test(segmento || "") || /INTEGRA[ÇC][ÃA]O/i.test(nome);
}
