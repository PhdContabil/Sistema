// Geração do PDF da Ordem de Serviço no navegador — migrado verbatim (layout
// e coordenadas) de os-pdf.js do Paralegal System, agora usando jsPDF do npm
// em vez do CDN.
import { jsPDF } from "jspdf";

// Carrega a logo da PhD (mesmo arquivo do cabecalho/login -- public/phd-logo.png)
// via <img> + canvas (em vez de embutir o PNG cru em base64): addImage com o PNG
// cru estava corrompendo a imagem no PDF final. Desenhando num canvas com fundo
// branco e reexportando como JPEG, o jsPDF embute certinho. Se a logo nao carregar
// por algum motivo, gerarDocPdfOS cai pro texto como estava antes.
async function carregarLogoComoJpegDataUrl(): Promise<string | null> {
  try {
    const img = new Image();
    const carregada = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar a logo da PhD."));
    });
    img.src = "/phd-logo.png";
    await carregada;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    return null;
  }
}

// Converte o PDF pra base64 manualmente a partir do arraybuffer -- doc.output
// ("datauristring") tava corrompendo o stream da imagem JPEG embutida (gerava
// um base64 com bytes "dobrados", o PDF ficava maior que o declarado no /Length
// e o anexo vinha ilegível). Esse caminho manual é o que efetivamente funciona.
export function pdfParaBase64(doc: jsPDF): string {
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}


interface DadosOSPdf {
  id?: string;
  titulo?: string;
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
  // Só usados na versão "Geral" (sem valores) -- ver gerarDocPdfOS.
  ativPrincipal?: string;
  inscrEstadual?: string;
  inscrMunicipal?: string;
  regimeTributario?: string;
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

function listaServicos(d: DadosOSPdf, comValores: boolean): string[] {
  const linhas: string[] = [];
  for (let i = 0; i < 4; i++) {
    const nome = d.servicos[i];
    const valor = d.valoresServ[i];
    if (nome) {
      linhas.push(nome + (comValores && valor ? " - " + Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""));
    }
  }
  if (comValores && d.valorTT) {
    linhas.push("Valor Total: " + Number(d.valorTT).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  }
  return linhas.length ? linhas : ["-"];
}

export function nomeArquivoPdfOS(d: DadosOSPdf, publico: "geral" | "financeiro" = "financeiro"): string {
  const cod = (d && (d.id || d.codigo)) || "os";
  const rotulo = publico === "geral" ? "Geral" : "Financeiro";
  return "OS " + rotulo + " - " + cod + ".pdf";
}

// "financeiro": mostra valores por serviço e valor total (nada de IE/IM/regime).
// "geral": sem nenhum valor monetário; mostra atividade principal (CNAE),
// inscrição estadual/municipal e regime tributário -- igual à separação que
// já existia no sistema antigo (Ordem de Serviço x COMUNICADO).
export async function gerarDocPdfOS(d: DadosOSPdf, publico: "geral" | "financeiro" = "financeiro"): Promise<jsPDF> {
  const comValores = publico === "financeiro";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margemX = 40;
  const largura = doc.internal.pageSize.getWidth() - margemX * 2;
  let y = 46;

  // Logo da PhD no lugar do nome em texto (mesma logo do cabecalho/login do
  // sistema). Largura fixa, altura calculada pela proporcao real do arquivo
  // (249x124) pra nao distorcer. Se por algum motivo a logo nao carregar, cai
  // pro texto como era antes.
  const logoDataUrl = await carregarLogoComoJpegDataUrl();
  const logoLargura = 76;
  const logoAltura = logoLargura * (124 / 249);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "JPEG", margemX, y - 20, logoLargura, logoAltura);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PhD Contabilidade e Consultoria", margemX, y);
  }

  // Tipo da OS (ex.: ABERTURA) centralizado entre a logo e o COMUNICADO.
  const tipoOS = (["mensal","avulso",""].includes(String(d.tipo ?? "").trim().toLowerCase()) ? String(d.titulo ?? "") : String(d.tipo ?? "")).trim();
  if (tipoOS) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    const larguraTitulo = largura - 2 * (logoLargura + 60);
    const linhasTitulo = doc.splitTextToSize(tipoOS.toUpperCase(), larguraTitulo) as string[];
    doc.text(linhasTitulo.slice(0, 2), margemX + largura / 2, linhasTitulo.length > 1 ? y - 6 : y, { align: "center" });
  }

  doc.setTextColor(192, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(comValores ? "ORDEM DE SERVIÇO" : "COMUNICADO", margemX + largura, y, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Início dos Trabalhos: " + fmtData(d.data), margemX + largura, y, { align: "right" });

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
  // Linha principal: cód. empresa (Questor) - razão social, nos dois PDFs.
  // Avulso (sem empresa no Questor, cód. empresa vazio/0): usa o cód. financeiro.
  const codEmpresa = String(d.questor ?? "").replace(/\D/g, "");
  // CPF (pessoa física): sempre ignora o cód. Questor e usa o cód. financeiro.
  const ehCpf = String(d.cnpj ?? "").replace(/\D/g, "").length === 11;
  const codPrincipal = !ehCpf && codEmpresa && Number(codEmpresa) > 0 ? codEmpresa : d.codigo;
  doc.text(txt(codPrincipal) + " - " + txt(d.razao), margemX, y);
  if (comValores) {
    // Só no Financeiro: Nº da OS e cód. financeiro.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Nº OS: " + txt(d.id) + "     Cód. financeiro: " + txt(d.codigo), margemX + largura, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
  }
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
  doc.text("Início das Atividades: " + fmtData(d.dataInicio), margemX, y);
  y += 13;

  // "Geral" (COMUNICADO): mostra atividade (CNAE) e I.E./I.M./Regime
  // Tributário -- nunca valores. "Financeiro" (Ordem de Serviço): mostra os
  // valores dos serviços/honorários, nunca esses dados cadastrais.
  if (!comValores) {
    doc.text("Ativ. Principal: " + txt(d.ativPrincipal), margemX, y);
    y += 13;
    const colLargura = largura / 3;
    doc.text("I.E.: " + txt(d.inscrEstadual), margemX, y);
    doc.text("I.M.: " + txt(d.inscrMunicipal), margemX + colLargura, y);
    doc.text("Regime Tributário: " + txt(d.regimeTributario), margemX + colLargura * 2, y);
    y += 13;
  }
  y += 9;

  secao("CONTATO");
  const contatoLinha = [
    d.contato,
    d.telefone || d.celular ? "Tel: " + (d.telefone || d.celular) : "",
    d.email ? "E-mail: " + d.email : "",
  ].filter(Boolean).join("     ");
  doc.text(contatoLinha || "-", margemX, y);
  y += 22;

  secao(comValores ? "SERVIÇOS / HONORÁRIOS" : "SERVIÇOS CONTRATADOS");
  listaServicos(d, comValores).forEach((linha) => {
    doc.text(linha, margemX, y);
    y += 14;
  });
  y += 8;

  // Igual ao sistema antigo (Access): PDF Financeiro mostra só "Observações
  // Financeiro" (campo obs); PDF Geral mostra só "Observações Gerais".
  function blocoObs(titulo: string, texto: string | undefined) {
    secao(titulo);
    const linhas = doc.splitTextToSize(texto || "-", largura) as string[];
    doc.text(linhas, margemX, y);
    y += linhas.length * 13 + 20;
  }
  blocoObs("OBSERVAÇÕES", comValores ? d.obs : d.obsGerais);


  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Emitente: " + txt(d.usuario || d.tratadoCom), margemX, y);

  return doc;
}
