"use client";

/** Paginação simples do histórico (anterior / próxima). */
export const LINHAS_POR_PAGINA = 50;

export default function PaginacaoLog({
  total, pagina, onPagina, porPagina = LINHAS_POR_PAGINA,
}: { total: number; pagina: number; onPagina: (p: number) => void; porPagina?: number }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  const de = pagina * porPagina + 1;
  const ate = Math.min(total, (pagina + 1) * porPagina);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0", flexWrap: "wrap", fontSize: 13 }}>
      <button className="btn" disabled={pagina <= 0} onClick={() => onPagina(0)}>«</button>
      <button className="btn" disabled={pagina <= 0} onClick={() => onPagina(pagina - 1)}>Anterior</button>
      <span>{de}–{ate} de {total} · página {pagina + 1} de {paginas}</span>
      <button className="btn" disabled={pagina >= paginas - 1} onClick={() => onPagina(pagina + 1)}>Próxima</button>
      <button className="btn" disabled={pagina >= paginas - 1} onClick={() => onPagina(paginas - 1)}>»</button>
    </div>
  );
}
