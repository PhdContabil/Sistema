import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS } from "@/lib/paralegal/os";
import { enviarEmail, GraphErro } from "@/lib/paralegal/graph";

// Envio da OS por e-mail (Graph, Mail.Send) — migrado de api/os-email.js do
// Paralegal System. Os destinatários fixos do sistema antigo (geral/financeiro)
// foram mantidos; dá pra ajustar via env se mudarem.
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

  try {
    const os = await obterOS(body.id);
    const assunto = `Ordem de Serviço — ${os.razao || os.codigo || os.id}`;
    const corpoHtml = `
      <p>Segue em anexo a Ordem de Serviço${os.razao ? ` referente a <strong>${os.razao}</strong>` : ""}.</p>
      <p>Código: ${os.codigo || os.questor || "-"}<br/>CNPJ: ${os.cnpj || "-"}</p>
      <p>Enviado automaticamente pelo Núcleo Contábil.</p>
    `;
    await enviarEmail({
      remetente: REMETENTE,
      para: [destino],
      assunto,
      corpoHtml,
      anexos: [{ nome: body.nomeArquivo || `OS-${os.codigo || os.id}.pdf`, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }],
    });
    return NextResponse.json({ ok: true, enviadoPara: destino });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao enviar e-mail." }, { status });
  }
}
