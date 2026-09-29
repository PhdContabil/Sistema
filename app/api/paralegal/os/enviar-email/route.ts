import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS } from "@/lib/paralegal/os";
import { construirEml } from "@/lib/paralegal/graph";

// Preparo do e-mail da OS — não manda nada pelo Microsoft Graph (isso exigiria uma
// caixa de serviço e permissão Mail.Send no Azure). Em vez disso monta um .eml pronto
// (destinatário + assunto + corpo + PDF anexado) e devolve pro navegador baixar; ao abrir
// esse arquivo, o próprio Outlook do usuário (a conta em que ele estiver logado no Windows/Outlook)
// assume como remetente, e ele só revisa e clica em "Enviar".
export const dynamic = "force-dynamic";

const DESTINATARIOS: Record<string, string> = {
  geral: process.env.PARALEGAL_EMAIL_GERAL || "geral@phdcontabil.com.br",
  financeiro: process.env.PARALEGAL_EMAIL_FINANCEIRO || "financeiro@phdcontabil.com.br",
};

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

  const eml = construirEml({
    para: [destino],
    assunto,
    corpoHtml,
    anexos: [{ nome: nomeArquivo, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }],
  });
  return NextResponse.json({
    ok: true,
    destino,
    emlBase64: Buffer.from(eml, "utf-8").toString("base64"),
    nomeArquivoEml: `OS-${os.codigo || os.id}.eml`,
  });
}
