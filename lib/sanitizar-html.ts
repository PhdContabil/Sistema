// Limpa HTML antes de pôr na tela (contratos editáveis): remove scripts, iframes,
// atributos on* e links javascript:. Roda só no navegador.
const PROIBIDAS = ["script", "iframe", "object", "embed", "link", "meta", "base", "form"];

export function sanitizarHtml(html: string): string {
  if (!html || typeof window === "undefined") return html ?? "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const raiz = doc.body.firstElementChild as HTMLElement | null;
  if (!raiz) return "";
  raiz.querySelectorAll(PROIBIDAS.join(",")).forEach((el) => el.remove());
  raiz.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      const nome = a.name.toLowerCase();
      const valor = a.value.replace(/\s/g, "").toLowerCase();
      if (nome.startsWith("on")) el.removeAttribute(a.name);
      else if ((nome === "href" || nome === "src" || nome === "xlink:href") && (valor.startsWith("javascript:") || valor.startsWith("data:text"))) el.removeAttribute(a.name);
    }
  });
  return raiz.innerHTML;
}