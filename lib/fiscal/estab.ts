// Filiais nas Notas Fiscais do Fiscal.
// O Núcleo identifica cada unidade emissora por um número só ("código de emissão"):
//   matriz (estab. 1) → o próprio código da empresa no Questor (ex.: 969);
//   filial            → 1.000.000 + código × 100 + estabelecimento (ex.: 969-2 → 1096902).
// Assim cadastro, tomadores, grupos e notas da filial ficam separados dos da matriz, sem mudar
// as tabelas. Códigos do Questor são bem menores que 1.000.000.
// SEM IMPORTS: usado no servidor e na tela.

const BASE = 1_000_000;

export function chaveEstab(codigoempresa: number, codigoestab = 1): number {
  return codigoestab > 1 ? BASE + codigoempresa * 100 + codigoestab : codigoempresa;
}

export function decodificarEstab(chave: number): { codigoempresa: number; codigoestab: number } {
  const n = Number(chave);
  return n >= BASE ? { codigoempresa: Math.floor((n - BASE) / 100), codigoestab: (n - BASE) % 100 } : { codigoempresa: n, codigoestab: 1 };
}

/** Como mostrar na tela: "969" ou "969-2". */
export function fmtCodEstab(chave: number | null | undefined): string {
  if (chave == null) return "";
  const { codigoempresa, codigoestab } = decodificarEstab(chave);
  return codigoestab > 1 ? `${codigoempresa}-${codigoestab}` : String(codigoempresa);
}
