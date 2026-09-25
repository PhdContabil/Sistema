// Formatação dos campos da guia para o Edoc do Questor Zen.
//
// Módulo sem import nenhum, de propósito: `node --experimental-strip-types`
// não resolve caminho relativo sem extensão, e a extensão quebraria o build
// do Next. Como estas três funções são a parte que dá errado em silêncio
// (atributo em branco, barra no nome do arquivo), elas precisam de teste.

/** "AAAA-MM-DD" → "DD/MM/AAAA", que é o formato que o Zen espera. */
export function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Valor em texto com vírgula decimal, como o Zen grava no atributo. */
export function valorBR(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

/**
 * Nome do arquivo no Edoc.
 *
 * Competência com barra viraria caminho na URL do upload, então vira hífen.
 * O CNPJ entra para o arquivo ser identificável mesmo fora da pasta do
 * cliente.
 */
export function nomeDoArquivo(cnpj: string, referencia: string): string {
  const doc = (cnpj ?? "").replace(/\D/g, "");
  const comp = (referencia ?? "").replace("/", "-");
  return `DARE-SP ${comp} ${doc}.pdf`;
}
