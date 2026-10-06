// Busca, filtro por motivo e paginação da tabela de resultado da simulação do
// Robô Zen (tela components/apps/RoboZen.tsx).
//
// Funções PURAS, sem nenhum import: este arquivo é importado pelo componente de
// tela (navegador), então não pode puxar código só-de-servidor (credenciais do
// Graph, chave do Supabase) — por isso fica separado de lib/robo-zen/db.ts etc.
// Também por serem puras dá pra testar sem tela nem banco.

/** Tamanhos de página oferecidos na tela. O primeiro é o padrão. */
export const TAMANHOS_PAGINA = [25, 50, 100] as const;

/** Chave usada no resumo por motivo (a mesma da rota .../resultado): empresa
 * sem motivo gravado conta como "NÃO PROCESSADA". */
export const MOTIVO_SEM_REGISTRO = "NÃO PROCESSADA";

export interface LinhaFiltravel {
  codigo: string;
  empresa: string;
  cnpj: string;
  motivo: string;
}

/** Minúsculas e sem acento: "Confecção" casa com "confeccao". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Mesma chave do resumo por motivo (ver MOTIVO_SEM_REGISTRO). */
export function chaveMotivo(linha: { motivo: string }): string {
  return linha.motivo || MOTIVO_SEM_REGISTRO;
}

/**
 * Filtra as linhas por texto livre e por motivo.
 *
 * - `busca`: cada palavra digitada precisa aparecer em algum de código, empresa,
 *   CNPJ ou motivo (sem diferenciar maiúscula nem acento). Vazia = não filtra.
 *   Quem digita só números ("43344362", "0001-02") também acha pelo CNPJ mesmo
 *   sem pontuação, e vice-versa.
 * - `motivo`: "" = todos; senão só as linhas com essa chave de motivo.
 * Mantém a ordem original.
 */
export function filtrarResultados<T extends LinhaFiltravel>(linhas: T[], busca: string, motivo: string): T[] {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0 && !motivo) return linhas;

  return linhas.filter((l) => {
    if (motivo && chaveMotivo(l) !== motivo) return false;
    if (palavras.length === 0) return true;
    const texto = normalizar(`${l.codigo} ${l.empresa} ${l.cnpj} ${l.motivo}`);
    const soDigitos = (l.cnpj || "").replace(/\D/g, "");
    return palavras.every((p) => {
      if (texto.includes(p)) return true;
      // Só números (com ou sem pontuação): compara com o CNPJ sem pontuação.
      const digitos = p.replace(/\D/g, "");
      return digitos.length >= 3 && /^[\d.\-/]+$/.test(p) && soDigitos.includes(digitos);
    });
  });
}

export interface PaginaDeItens<T> {
  itens: T[];
  /** Página efetiva (1-based), já limitada ao intervalo válido. */
  pagina: number;
  totalPaginas: number;
  total: number;
  /** Posição (1-based) do 1º e do último item exibidos; 0 e 0 se não houver itens. */
  de: number;
  ate: number;
}

/**
 * Recorta uma página. Número de página fora do intervalo (ex.: depois de um
 * filtro que encolheu a lista) vira o mais próximo válido, em vez de uma página
 * vazia. `porPagina` inválido (≤ 0, NaN) cai no tamanho padrão.
 */
export function paginar<T>(itens: T[], pagina: number, porPagina: number): PaginaDeItens<T> {
  const tamanho = Number.isFinite(porPagina) && porPagina >= 1 ? Math.floor(porPagina) : TAMANHOS_PAGINA[0];
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const pedida = Number.isFinite(pagina) ? Math.floor(pagina) : 1;
  const efetiva = Math.min(Math.max(1, pedida), totalPaginas);
  const inicio = (efetiva - 1) * tamanho;
  const fatia = itens.slice(inicio, inicio + tamanho);
  return {
    itens: fatia,
    pagina: efetiva,
    totalPaginas,
    total,
    de: fatia.length === 0 ? 0 : inicio + 1,
    ate: fatia.length === 0 ? 0 : inicio + fatia.length,
  };
}
