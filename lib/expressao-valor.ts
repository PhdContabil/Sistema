// Conta simples nos campos de valor (chamado #1412): "100+20" vira 120 e
// "90-10" vira 80. Só soma e subtração, sem eval: o texto é validado por
// regex e somado em centavos (sem erro de ponto flutuante).

export type ResultadoConta = { ok: true; valor: number } | { ok: false; motivo: string };

/** Mesma regra do servidor: com vírgula, o ponto é milhar ("1.234,56"); sem vírgula, o ponto é decimal ("12.5"). */
function numeroDoTermo(t: string): number {
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}

/** Campo vazio vale 0. Aceita um número ou uma conta de + e −, com ou sem espaços. */
export function avaliarValor(texto: string): ResultadoConta {
  const s = texto.replace(/\s+/g, "");
  if (s === "") return { ok: true, valor: 0 };
  if (!/^[+-]?\d[\d.,]*([+-]\d[\d.,]*)*$/.test(s)) return { ok: false, motivo: "use só números, vírgula, + e −." };

  let centavos = 0;
  for (const m of s.matchAll(/([+-]?)(\d[\d.,]*)/g)) {
    const n = numeroDoTermo(m[2]!);
    if (!Number.isFinite(n)) return { ok: false, motivo: `número inválido (${m[2]}).` };
    const c = Math.round(n * 100);
    centavos += m[1] === "-" ? -c : c;
  }
  return { ok: true, valor: centavos / 100 };
}

/** O texto tem uma conta (sinal depois do primeiro número)? */
export function temConta(texto: string): boolean {
  return /\d\s*[+-]/.test(texto);
}

/** 120 -> "120,00" (como o servidor lê). */
export function formatarValorCampo(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/**
 * Texto final do campo: resolve a conta se houver. Devolve o texto normalizado
 * ("120,00") ou lança Error em português (conta inválida ou resultado negativo).
 */
export function resolverCampo(texto: string, rotulo: string): string {
  if (texto.trim() === "") return "";
  const r = avaliarValor(texto);
  if (!r.ok) throw new Error(`${rotulo}: ${r.motivo}`);
  if (r.valor < 0) throw new Error(`${rotulo}: o resultado não pode ser negativo (${formatarValorCampo(r.valor)}).`);
  return temConta(texto) ? formatarValorCampo(r.valor) : texto;
}
