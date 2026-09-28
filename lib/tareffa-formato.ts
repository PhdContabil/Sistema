// Nome do arquivo como o front do Tareffa trata. Sem imports, para teste.

/** Mesmo tratamento do front: "TESTE_API.pdf" -> "testeapi.pdf". */
export function nomeTareffa(nome: string): string {
  const s = (nome ?? "").trim();
  const ponto = s.lastIndexOf(".");
  const base = ponto > 0 ? s.slice(0, ponto) : s;
  const ext = ponto > 0 ? s.slice(ponto).toLowerCase() : "";
  const limpo = base
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return limpo + ext;
}
