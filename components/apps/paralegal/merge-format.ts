// Formatadores puros (sem dependências de servidor) reaproveitados do
// mail-merge — separados de lib/paralegal/merge-contrato.ts porque aquele
// arquivo importa tipos de lib/questor.ts, que não pode ser importado em
// componente client (chave da API Questor só existe no servidor).
// CPF (11 dígitos) ou CNPJ (14) com a máscara certa.
export function formatarDoc(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return formatarCnpj(v);
}

export function formatarCnpj(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 14) return v ? String(v) : "";
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
