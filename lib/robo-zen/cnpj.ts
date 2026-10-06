// Conferência do CNPJ pelos dígitos verificadores — lógica PURA (sem imports),
// pra poder ser usada em qualquer lugar do Robô Zen e testada sem PDF/OCR.
//
// Os dois últimos dígitos de um CNPJ são calculados dos 12 primeiros (módulo 11).
// Um CNPJ que não bate nessa conta NÃO existe — o Questor recusa com "Inscrição
// Federal Inválida". Quando o texto vem de OCR (documento escaneado), um dígito
// trocado (ex.: 8 lido como 2) produz exatamente esse tipo de número.

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: string, pesos: number[]): string {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * pesos[i];
  }
  const resto = soma % 11;
  return resto < 2 ? "0" : String(11 - resto);
}

/** Só os dígitos, se forem exatamente 14 e não forem todos iguais; senão null. */
function digitos14(cnpj: string): string | null {
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14 || digitos === digitos[0].repeat(14)) return null;
  return digitos;
}

/**
 * Confere os dois dígitos verificadores oficiais do CNPJ (módulo 11).
 *
 * Aceita com ou sem pontuação. Só devolve true se as contas baterem — não
 * é uma verificação de existência real na Receita, só da fórmula.
 */
export function cnpjValido(cnpj: string): boolean {
  const digitos = digitos14(cnpj);
  if (!digitos) return false;
  const dv1 = digitoVerificador(digitos.slice(0, 12), PESOS_DV1);
  const dv2 = digitoVerificador(digitos.slice(0, 12) + dv1, PESOS_DV2);
  return digitos.slice(-2) === dv1 + dv2;
}

/** 14 dígitos -> 00.000.000/0000-00. */
export function formatarCnpj(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Para um CNPJ que NÃO passa na conferência: o CNPJ que teria os mesmos 12
 * primeiros dígitos e os dígitos verificadores corretos. É só uma PISTA pra
 * quem for conferir o documento (vale quando o erro foi nos dois últimos dígitos
 * — o caso comum de OCR); se o erro foi em outro dígito, a pista não serve.
 * Nunca deve ser usada automaticamente. Devolve null se o CNPJ já é válido ou se
 * nem tem 14 dígitos.
 */
export function sugerirDigitosCnpj(cnpj: string): string | null {
  const digitos = digitos14(cnpj);
  if (!digitos || cnpjValido(digitos)) return null;
  const base = digitos.slice(0, 12);
  const dv1 = digitoVerificador(base, PESOS_DV1);
  const dv2 = digitoVerificador(base + dv1, PESOS_DV2);
  return formatarCnpj(base + dv1 + dv2);
}
