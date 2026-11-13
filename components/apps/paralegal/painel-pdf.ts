// PDF do Painel Gerencial, gerado no navegador com jsPDF (A4 paisagem, tabela com quebra de página).
import { jsPDF } from "jspdf";
import { dataBR, ROTULO_ALERTA, type Alerta, type ProcessoPainel, type Resumo } from "@/lib/paralegal/painel";

// A fonte padrão do PDF só tem Latin-1: troca travessões, bolinhas e aspas "curvas".
const limpo = (s: string) => s.replace(/[–—]/g, "-").replace(/[·•]/g, "|").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");

const COR: Partial<Record<Alerta, [number, number, number]>> = {
  atrasado: [185, 28, 28], vence_2d: [180, 83, 9], vence_7d: [138, 109, 0], sem_pendencia: [29, 122, 63],
};

export function gerarPdfPainel(ps: ProcessoPainel[], resumo: Resumo, hoje: string, filtroTexto: string): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, H = 210, M = 10, FS = 8, LH = 3.7;
  const cols = [
    { t: "Empresa", w: 68 }, { t: "Responsável", w: 34 }, { t: "Status", w: 32 },
    { t: "Onde está", w: 78 }, { t: "Andamento", w: 28 }, { t: "Alerta", w: 37 },
  ];

  let y = M;
  const cabecalhoPagina = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(11, 23, 57);
    doc.text("Painel Gerencial do Paralegal", M, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text(limpo(`${dataBR(hoje)}${filtroTexto ? ` | filtro: ${filtroTexto}` : ""}`), W - M, y + 5, { align: "right" });
    y += 9;
    doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(limpo(`${resumo.ativos} processos ativos | ${resumo.atrasados} atrasados | ${resumo.vence2d} vencem em 2 dias | ${resumo.vence7d} vencem em 7 dias | ${resumo.prontos} prontos para concluir | ${resumo.faltam} atividades faltando`), M, y + 3);
    doc.text(limpo(`${ps.length} processos nesta lista`), W - M, y + 3, { align: "right" });
    y += 8;
  };
  const cabecalhoTabela = () => {
    doc.setFillColor(241, 245, 249); doc.rect(M, y, W - 2 * M, 6.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    let x = M;
    for (const c of cols) { doc.text(c.t.toUpperCase(), x + 1.5, y + 4.4); x += c.w; }
    y += 6.5;
  };

  cabecalhoPagina(); cabecalhoTabela();

  for (const p of ps) {
    const onde = [p.etapaManual, p.etapaAtual, p.etapaPrazo ? `prazo ${dataBR(p.etapaPrazo)}` : ""].filter(Boolean).join("\n");
    const celulas = [
      p.nome, p.responsavel, p.status, onde,
      `${p.feitas} feitas | ${p.falta} faltam`, ROTULO_ALERTA[p.alerta],
    ].map((t, i) => doc.setFont("helvetica", i === 0 ? "bold" : "normal").setFontSize(FS).splitTextToSize(limpo(t), cols[i].w - 3) as string[]);
    const linhas = Math.max(...celulas.map((c) => c.length));
    const h = linhas * LH + 3;
    if (y + h > H - M - 6) { doc.addPage(); y = M; cabecalhoPagina(); cabecalhoTabela(); }
    let x = M;
    celulas.forEach((lin, i) => {
      doc.setFont("helvetica", i === 0 || i === 5 ? "bold" : "normal").setFontSize(FS);
      const cor = i === 5 ? COR[p.alerta] : undefined;
      if (cor) doc.setTextColor(...cor); else doc.setTextColor(15, 23, 42);
      doc.text(lin, x + 1.5, y + 4);
      x += cols[i].w;
    });
    doc.setDrawColor(226, 232, 240); doc.line(M, y + h, W - M, y + h);
    y += h;
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Página ${i} de ${n}`, W - M, H - 5, { align: "right" });
    doc.text("PHD Contábil | Núcleo", M, H - 5);
  }
  doc.save(`painel-gerencial-paralegal-${hoje}.pdf`);
}
