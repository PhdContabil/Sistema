// Geração do PDF da Ordem de Serviço no navegador — migrado verbatim (layout
// e coordenadas) de os-pdf.js do Paralegal System, agora usando jsPDF do npm
// em vez do CDN.
import { jsPDF } from "jspdf";

interface DadosOSPdf {
  codigo?: string;
  questor?: string;
  tipo?: string;
  dataInicio?: string | null;
  data?: string | null;
  razao?: string;
  cnpj?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  natJuridica?: string;
  contato?: string;
  telefone?: string;
  celular?: string;
  email?: string;
  servicos: [string, string, string, string];
  valoresServ: [number | null, number | null, number | null, number | null];
  valorTT: number | null;
  obsGerais?: string;
  obs?: string;
  usuario?: string;
  tratadoCom?: string;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function txt(v: unknown): string {
  return v === undefined || v === null || v === "" ? "-" : String(v);
}

function listaServicos(d: DadosOSPdf): string[] {
  const linhas: string[] = [];
  for (let i = 0; i < 4; i++) {
    const nome = d.servicos[i];
    const valor = d.valoresServ[i];
    if (nome) {
      linhas.push(nome + (valor ? " - " + Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""));
    }
  }
  if (d.valorTT) {
    linhas.push("Valor Total: " + Number(d.valorTT).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  }
  return linhas.length ? linhas : ["-"];
}

export function nomeArquivoPdfOS(d: DadosOSPdf): string {
  const cod = (d && (d.codigo ?? d.questor)) || "os";
  return "OS-" + cod + ".pdf";
}

export function gerarDocPdfOS(d: DadosOSPdf): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margemX = 40;
  const largura = doc.internal.pageSize.getWidth() - margemX * 2;
  let y = 46;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("PhD Contabilidade e Consultoria", margemX, y);

  doc.setTextColor(192, 0, 0);
  doc.setFontSize(15);
  doc.text((d.tipo || "COMUNICADO").toString().toUpperCase(), margemX + largura, y, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Início dos Trabalhos: " + fmtData(d.dataInicio || d.data), margemX + largura, y, { align: "right" });

  y += 14;
  doc.setDrawColor(0);
  doc.setLineWidth(1.2);
  doc.line(margemX, y, margemX + largura, y);
  y += 22;

  function secao(titulo: string) {
    doc.setFillColor(217, 217, 217);
    doc.rect(margemX, y - 13, largura, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(titulo, margemX + largura / 2, y, { align: "center" });
    y += 22;
    doc.setFont("helvetica", "normal");
  }

  secao("DADOS");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(txt(d.codigo ?? d.questor) + " - " + txt(d.razao), margemX, y);
  y += 15;
  doc.setTextColor(192, 0, 0);
  doc.text(txt(d.cnpj), margemX, y);
  doc.setTextColor(0, 0, 0);
  y += 15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const endereco = [d.logradouro, d.numero, d.complemento].filter(Boolean).join(", ") || "-";
  doc.text(endereco, margemX, y);
  y += 13;
  const cidade = [d.bairro, d.cidade, d.cep].filter(Boolean).join(" - ") || "-";
  doc.text(cidade, margemX, y);
  y += 13;
  doc.text("Ativ. Principal: " + txt(d.natJuridica), margemX, y);
  y += 13;
  doc.text("Início das Atividades: " + fmtData(d.dataInicio), margemX, y);
  y += 22;

  secao("CONTATO");
  const contatoLinha = [
    d.contato,
    d.telefone || d.celular ? "Tel: " + (d.telefone || d.celular) : "",
    d.email ? "E-mail: " + d.email : "",
  ].filter(Boolean).join("     ");
  doc.text(contatoLinha || "-", margemX, y);
  y += 22;

  secao("SERVIÇOS CONTRATADOS");
  listaServicos(d).forEach((linha) => {
    doc.text(linha, margemX, y);
    y += 14;
  });
  y += 8;

  secao("OBSERVAÇÕES");
  const obsPartes = [d.obsGerais, d.obs].filter(Boolean).join("\n\n") || "-";
  const obsLinhas = doc.splitTextToSize(obsPartes, largura) as string[];
  doc.text(obsLinhas, margemX, y);
  y += obsLinhas.length * 13 + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Emitente: " + txt(d.usuario || d.tratadoCom), margemX, y);

  return doc;
}
