import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS } from "@/lib/paralegal/os";
import { enviarEmail, construirEml, GraphErro } from "@/lib/paralegal/graph";

// Envio da OS por e-mail. Tenta primeiro pelo Microsoft Graph (Mail.Send,
// app-only) a partir da caixa PARALEGAL_EMAIL_REMETENTE — igual ao Paralegal System
// antigo (que manda de verdade, sem abrir nada no cliente). Se isso falhar por
// qualquer motivo (permissão, caixa incorreta, etc.), cai pro plano B: monta um
// .eml pronto (destinatário + assunto + corpo + PDF anexado) e devolve pro navegador
// baixar -- o usuário abre no Outlook e só clica em Enviar.
export const dynamic = "force-dynamic";

const DESTINATARIOS: Record<string, string> = {
  geral: process.env.PARALEGAL_EMAIL_GERAL || "geral@phdcontabil.com.br",
  financeiro: process.env.PARALEGAL_EMAIL_FINANCEIRO || "financeiro@phdcontabil.com.br",
};

const REMETENTE = process.env.PARALEGAL_EMAIL_REMETENTE || DESTINATARIOS.geral;

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  let body: { id?: string; destinatario?: string; pdfBase64?: string; nomeArquivo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "Informe a OS." }, { status: 400 });
  if (!body.pdfBase64) return NextResponse.json({ error: "PDF não gerado." }, { status: 400 });
  const destino = DESTINATARIOS[body.destinatario ?? "geral"];
  if (!destino) return NextResponse.json({ error: "Destinatário inválido." }, { status: 400 });

  const os = await obterOS(body.id).catch(() => null);
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });

  const assunto = `Ordem de Serviço — ${os.razao || os.codigo || os.id}`;
  const corpoHtml = `
    <p>Segue em anexo a Ordem de Serviço${os.razao ? ` referente a <strong>${os.razao}</strong>` : ""}.</p>
    <p>Código: ${os.codigo || os.questor || "-"}<br/>CNPJ: ${os.cnpj || "-"}</p>
  `;
  const nomeArquivo = body.nomeArquivo || `OS-${os.codigo || os.id}.pdf`;
  const anexos = [{ nome: nomeArquivo, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }];

  try {
    await enviarEmail({ remetente: REMETENTE, para: [destino], assunto, corpoHtml, anexos });
    return NextResponse.json({ ok: true, modo: "graph", enviadoPara: destino });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao enviar e-mail.";
    const status = e instanceof GraphErro ? e.status : 502;
    console.error("[paralegal/os/enviar-email] envio via Graph falhou (" + status + "): " + mensagem);
    // Plano B: não deixa o usuário sem saída -- monta o .eml com tudo pronto pra abrir no Outlook.
    const eml = construirEml({ para: [destino], assunto, corpoHtml, anexos });
    return NextResponse.json({
      ok: true,
      modo: "eml",
      avisoGraph: mensagem,
      destino,
      emlBase64: Buffer.from(eml, "utf-8").toString("base64"),
      nomeArquivoEml: `OS-${os.codigo || os.id}.eml`,
    });
  }
}
