// PDF do Termo de Confissão de Dívida, no navegador (jsPDF do npm).
// Desenha os mesmos blocos que a prévia da tela mostra.
import { jsPDF } from "jspdf";
import type { BlocoTermo } from "@/lib/confissao-divida";

export function gerarPdfTermo(blocos: BlocoTermo[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 25;            // margem esquerda
  const W = 160;           // largura útil
  const LH = 6;            // altura da linha
  const TOPO = 28;
  const FUNDO = 279;
  let y = TOPO;
  const precisa = (h: number) => {
    if (y + h > FUNDO) { doc.addPage(); y = TOPO; }
  };

  doc.setFont("times", "normal");
  doc.setFontSize(12);

  for (const b of blocos) {
    if (b.t === "title") {
      doc.setFont("times", "bold"); doc.setFontSize(14);
      doc.text(b.text, 105, y, { align: "center" });
      y += 12;
      doc.setFont("times", "normal"); doc.setFontSize(12);
    } else if (b.t === "p") {
      const linhas = doc.splitTextToSize(b.text, W) as string[];
      precisa(linhas.length * LH);
      doc.text(b.text, M, y, { maxWidth: W, align: "justify" });
      y += linhas.length * LH + 2;
    } else if (b.t === "dt") {
      precisa(LH * 2);
      y += 2;
      doc.text(b.text, M, y);
      y += LH;
    } else if (b.t === "co") {
      doc.setFont("times", "bold");
      const linhas = doc.splitTextToSize("•  " + b.text, W) as string[];
      precisa(linhas.length * LH + LH);
      y += 2;
      doc.text(linhas, M, y);
      y += linhas.length * LH;
      doc.setFont("times", "normal");
    } else if (b.t === "li") {
      const linhas = doc.splitTextToSize(b.text, W - 8) as string[];
      precisa(linhas.length * LH);
      doc.text(linhas, M + 8, y);
      y += linhas.length * LH + 1;
    } else if (b.t === "tot") {
      doc.setFont("times", "bold");
      precisa(LH * 2);
      y += 3;
      doc.text("•  " + b.text, M, y);
      y += LH + 3;
      doc.setFont("times", "normal");
    } else if (b.t === "sign") {
      precisa(30);
      y += 14;
      const w = 74;
      doc.setLineWidth(0.3);
      doc.line(M, y, M + w, y);
      doc.line(M + W - w, y, M + W, y);
      const l = doc.splitTextToSize(b.l, w) as string[];
      const r = doc.splitTextToSize(b.r, w) as string[];
      doc.setFontSize(11);
      doc.text(l, M + w / 2, y + 5, { align: "center" });
      doc.text(r, M + W - w / 2, y + 5, { align: "center" });
      doc.setFontSize(12);
      y += 5 + Math.max(l.length, r.length) * 5 + 4;
    }
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Página ${i} de ${paginas}`, 105, 288, { align: "center" });
    doc.setTextColor(0);
  }
  return doc;
}

/** Nome do arquivo: confissao-de-divida-<devedor>-<AAAA-MM-DD>.pdf */
export function nomeArquivoTermo(devedor: string, dataIso: string): string {
  const slug = devedor
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `confissao-de-divida-${slug || "devedor"}-${dataIso}.pdf`;
}
