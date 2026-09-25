// Linha digitável da guia de arrecadação, a partir do código de barras de 44
// dígitos. Puro: node --experimental-strip-types --test lib/dare-sp-linha.test.ts
//
// A Sefaz devolve o código de barras, não a linha. Quem vai pagar digita a
// linha — então montá-la errado é o mesmo que não entregar a guia.
//
// Convenção FEBRABAN de arrecadação: os 44 dígitos viram 4 blocos de 11, cada
// um seguido do próprio dígito verificador, resultando em 48 caracteres.
// O dígito da 3ª posição do código diz qual módulo usar:
//   6 ou 7 → módulo 10     8 ou 9 → módulo 11
// Usar o módulo errado gera uma linha que o banco recusa na digitação.

/** Só os dígitos. A Sefaz às vezes devolve com espaços. */
export function apenasDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** DV módulo 10 dos blocos de arrecadação. */
export function dvModulo10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let p = Number(bloco[i]) * peso;
    if (p > 9) p -= 9; // soma os algarismos: 14 → 1+4 = 5, que é 14-9
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/** DV módulo 11 dos blocos de arrecadação, com pesos de 2 a 9. */
export function dvModulo11(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    soma += Number(bloco[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  // Convenção da arrecadação: resto 0 → DV 0; resto 1 → DV 0; senão 11 - resto.
  if (resto === 0 || resto === 1) return 0;
  return 11 - resto;
}

/**
 * Monta a linha digitável de 48 dígitos a partir dos 44 do código de barras.
 *
 * Devolve `null` quando a entrada não tem 44 dígitos, em vez de montar uma
 * linha a partir de lixo — linha inválida só é descoberta na boca do caixa.
 */
export function linhaDigitavel(codigoBarras44: string): string | null {
  const c = apenasDigitos(codigoBarras44);
  if (c.length !== 44) return null;

  const idValor = c[2];
  const usaModulo10 = idValor === "6" || idValor === "7";
  const usaModulo11 = idValor === "8" || idValor === "9";
  if (!usaModulo10 && !usaModulo11) return null;

  let saida = "";
  for (let i = 0; i < 4; i++) {
    const bloco = c.slice(i * 11, i * 11 + 11);
    const dv = usaModulo10 ? dvModulo10(bloco) : dvModulo11(bloco);
    saida += bloco + String(dv);
  }
  return saida;
}

/** A mesma linha, agrupada em 4 blocos, como aparece impressa na guia. */
export function linhaFormatada(codigoBarras44: string): string | null {
  const l = linhaDigitavel(codigoBarras44);
  if (!l) return null;
  return [l.slice(0, 12), l.slice(12, 24), l.slice(24, 36), l.slice(36, 48)].join(" ");
}

/**
 * Confere uma linha de 48 dígitos recalculando cada DV.
 *
 * Serve para validar o que a Sefaz mandou pronto: se ela já devolver a linha,
 * conferimos em vez de confiar — é barato e pega erro de transporte.
 */
export function linhaValida(linha48: string): boolean {
  const l = apenasDigitos(linha48);
  if (l.length !== 48) return false;

  const idValor = l[2];
  const usaModulo10 = idValor === "6" || idValor === "7";
  const usaModulo11 = idValor === "8" || idValor === "9";
  if (!usaModulo10 && !usaModulo11) return false;

  for (let i = 0; i < 4; i++) {
    const campo = l.slice(i * 12, i * 12 + 12);
    const bloco = campo.slice(0, 11);
    const dv = Number(campo[11]);
    const esperado = usaModulo10 ? dvModulo10(bloco) : dvModulo11(bloco);
    if (dv !== esperado) return false;
  }
  return true;
}

/** Linha de 48 → código de barras de 44, tirando os DVs. */
export function codigoDeBarras(linha48: string): string | null {
  const l = apenasDigitos(linha48);
  if (l.length !== 48) return null;
  return [0, 1, 2, 3].map((i) => l.slice(i * 12, i * 12 + 11)).join("");
}
