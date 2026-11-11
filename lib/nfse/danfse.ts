// DANFSe (PDF) gerado a partir do XML da NFS-e nacional — SERVIDOR.
// A API de DANFSe do ADN foi suspensa; o PDF é montado aqui (jsPDF + QR Code),
// com os dados do próprio XML. Layout simplificado em A4 retrato.
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

function tag(xml: string, nome: string, dentroDe?: string): string {
  const base = dentroDe ? (new RegExp(`<(?:[\\w-]+:)?${dentroDe}[\\s>][\\s\\S]*?</(?:[\\w-]+:)?${dentroDe}>`).exec(xml)?.[0] ?? "") : xml;
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(base);
  return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim() : "";
}

const brl = (v: string) => (v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-");
const data = (v: string) => (v ? v.slice(0, 10).split("-").reverse().join("/") + (v.length > 10 ? " " + v.slice(11, 16) : "") : "-");
const doc = (v: string) => v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v.length === 11 ? v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : v;

export async function gerarDanfse(nfseXml: string, chave: string, ambiente: number): Promise<Buffer> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const L = 12, W = 186;
  let y = 14;

  const caixa = (titulo: string, linhas: [string, string][], alt?: number) => {
    const h = alt ?? 7 + Math.ceil(linhas.length / 2) * 9;
    pdf.setDrawColor(150); pdf.rect(L, y, W, h);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text(titulo, L + 2, y + 4.5);
    linhas.forEach(([r, v], i) => {
      const x = L + 2 + (i % 2) * (W / 2), yy = y + 9 + Math.floor(i / 2) * 9;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(90); pdf.text(r, x, yy);
      pdf.setFontSize(8.5); pdf.setTextColor(0); pdf.text(pdf.splitTextToSize(v || "-", W / 2 - 4)[0], x, yy + 4);
    });
    y += h + 3;
  };

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  pdf.text("DANFSe - Documento Auxiliar da NFS-e", L, y);
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
  pdf.text("Padrão Nacional de NFS-e", L, y + 5);
  if (ambiente !== 1) { pdf.setTextColor(200, 0, 0); pdf.text("PRODUÇÃO RESTRITA - SEM VALOR FISCAL", L + 110, y + 5); pdf.setTextColor(0); }
  const qr = await QRCode.toDataURL(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`, { margin: 0, width: 160 });
  pdf.addImage(qr, "PNG", L + W - 26, 8, 24, 24);
  y += 12;
  pdf.setFontSize(7.5); pdf.text(`Chave de acesso: ${chave}`, L, y); y += 6;

  caixa("NFS-e", [
    ["Número da NFS-e", tag(nfseXml, "nNFSe")],
    ["Data/hora do processamento", data(tag(nfseXml, "dhProc"))],
    ["Competência", data(tag(nfseXml, "dCompet"))],
    ["Número / série da DPS", `${tag(nfseXml, "nDPS")} / ${tag(nfseXml, "serie")}`],
  ]);
  caixa("PRESTADOR", [
    ["CNPJ", doc(tag(nfseXml, "CNPJ", "emit"))],
    ["Nome / razão social", tag(nfseXml, "xNome", "emit")],
    ["Inscrição municipal", tag(nfseXml, "IM", "emit")],
    ["Município", tag(nfseXml, "xLocEmi") || "Taboão da Serra - SP"],
  ]);
  caixa("TOMADOR", [
    ["CPF/CNPJ", doc(tag(nfseXml, "CNPJ", "toma") || tag(nfseXml, "CPF", "toma"))],
    ["Nome / razão social", tag(nfseXml, "xNome", "toma")],
    ["Endereço", [tag(nfseXml, "xLgr", "toma"), tag(nfseXml, "nro", "toma"), tag(nfseXml, "xBairro", "toma")].filter(Boolean).join(", ")],
    ["CEP / e-mail", [tag(nfseXml, "CEP", "toma"), tag(nfseXml, "email", "toma")].filter(Boolean).join(" · ")],
  ]);

  const desc = pdf.splitTextToSize(tag(nfseXml, "xDescServ") || "-", W - 4) as string[];
  const hServ = 16 + desc.length * 3.6;
  pdf.rect(L, y, W, hServ);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("SERVIÇO", L + 2, y + 4.5);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  pdf.text(`Código de tributação nacional: ${tag(nfseXml, "cTribNac")}  ·  NBS: ${tag(nfseXml, "cNBS")}`, L + 2, y + 9);
  pdf.text(desc, L + 2, y + 13.5);
  y += hServ + 3;

  caixa("VALORES", [
    ["Valor do serviço", brl(tag(nfseXml, "vServ"))],
    ["Valor líquido", brl(tag(nfseXml, "vLiq"))],
    ["ISSQN", tag(nfseXml, "tpRetISSQN") === "2" ? "Retido pelo tomador" : "Não retido (Simples Nacional)"],
    ["Tributos aproximados (Simples)", tag(nfseXml, "pTotTribSN") ? `${tag(nfseXml, "pTotTribSN")}%` : "-"],
  ]);
  const comp = tag(nfseXml, "xInfComp");
  if (comp) {
    const linhas = pdf.splitTextToSize(comp, W - 4) as string[];
    pdf.rect(L, y, W, 8 + linhas.length * 3.6);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("INFORMAÇÕES COMPLEMENTARES", L + 2, y + 4.5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.text(linhas, L + 2, y + 9);
  }
  pdf.setFontSize(6.5); pdf.setTextColor(120);
  pdf.text("Gerado pelo Núcleo Contábil a partir do XML da NFS-e. Consulte a autenticidade em www.nfse.gov.br com a chave de acesso.", L, 290);
  return Buffer.from(pdf.output("arraybuffer"));
}
