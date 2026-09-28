import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS } from "@/lib/paralegal/os";
import { enviarEmail, construirEml, GraphErro } from "@/lib/paralegal/graph";

// Envio da OS por e-mail (Graph, Mail.Send) — migrado de api/os-email.js do
// Paralegal System. Os destinatários fixos do sistema antigo (geral/financeiro)
// foram mantidos; dá pra ajustar via env se mudarem.
//
// Se o envio automático pelo Graph falhar (ex.: falta a permissão Mail.Send no Azure),
// devolvemos um arquivo .eml pronto (assunto + corpo + PDF anexado) pra o
// usuário baixar e abrir no Outlook -- ele só precisa clicar em "Enviar".
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
    <p>Enviado automaticamente pelo Núcleo Contábil.</p>
  `;
  const nomeArquivo = body.nomeArquivo || `OS-${os.codigo || os.id}.pdf`;

  try {
    await enviarEmail({
      remetente: REMETENTE,
      para: [destino],
      assunto,
      corpoHtml,
      anexos: [{ nome: nomeArquivo, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }],
    });
    return NextResponse.json({ ok: true, enviadoPara: destino });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    const mensagem = e instanceof Error ? e.message : "Falha ao enviar e-mail.";
    // Plano B: monta o .eml com tudo pronto pra não deixar o usuário sem saída --
    // ele baixa esse arquivo e abre no Outlook (ou no cliente de e-mail padrão),
    // que já vem com destinatário, assunto, corpo e o PDF anexados.
    const eml = construirEml({
      para: [destino],
      assunto,
      corpoHtml,
      anexos: [{ nome: nomeArquivo, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }],
    });
    return NextResponse.json({
      error: mensagem,
      emlBase64: Buffer.from(eml, "utf-8").toString("base64"),
      nomeArquivoEml: `OS-${os.codigo || os.id}.eml`,
    }, { status });
  }
}
