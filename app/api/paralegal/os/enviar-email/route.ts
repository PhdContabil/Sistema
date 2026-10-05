import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS } from "@/lib/paralegal/os";
import { enviarEmail, construirEml, GraphErro } from "@/lib/paralegal/graph";

// Envio da OS por e-mail. Manda pelo Microsoft Graph (Mail.Send, app-only) usando
// a própria conta do usuário logado como remetente (a mesma conta que ele usa pra entrar
// no Núcleo) -- geral/financeiro são só os destinatários, nunca o remetente. Se isso falhar por
// qualquer motivo (permissão, conta sem caixa, etc.), cai pro plano B: monta um .eml pronto
// (destinatário + assunto + corpo + PDF anexado) e devolve pro navegador baixar -- o
// usuário abre no Outlook e só clica em Enviar.
export const dynamic = "force-dynamic";

// Lista de destinatários por público (as env vars aceitam vários e-mails separados por vírgula).
const lista = (v: string) => v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
const DESTINATARIOS: Record<string, string[]> = {
  geral: lista(process.env.PARALEGAL_EMAIL_GERAL || "geral@phdcontabil.com.br"),
  financeiro: lista(
    process.env.PARALEGAL_EMAIL_FINANCEIRO ||
      "financeiro@phdcontabil.com.br,eloiza.garcia@phdcontabil.com.br,graciele@phdcontabil.com.br"
  ),
};

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  const remetente = user?.email;
  if (!remetente) return NextResponse.json({ error: "Não consegui identificar seu e-mail de login pra usar como remetente." }, { status: 401 });

  let body: { id?: string; destinatario?: string; pdfBase64?: string; nomeArquivo?: string; rascunho?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "Informe a OS." }, { status: 400 });
  if (!body.pdfBase64) return NextResponse.json({ error: "PDF não gerado." }, { status: 400 });
  const para = DESTINATARIOS[body.destinatario ?? "geral"];
  if (!para?.length) return NextResponse.json({ error: "Destinatário inválido." }, { status: 400 });

  const os = await obterOS(body.id).catch(() => null);
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });

  const titulo = (os.tipo || "").trim().toUpperCase();
  const ehFinanceiro = body.destinatario === "financeiro";
  // Cód. financeiro só aparece no e-mail do Financeiro.
  const extraFin = ehFinanceiro && os.codigo ? ` - Cód. financeiro: ${os.codigo}` : "";
  const assunto = `OS${titulo ? " " + titulo : ""} - ${os.razao || os.id} - O.S. nº: ${os.id}${extraFin}`;
  const corpoHtml = `
    <p>Prezados(as),</p>
    <p>Segue em anexo a O.S. com todas as informações.</p>
    <p>Fico à disposição.<br/>Atenciosamente,</p>
  `;
  const rotulo = (body.destinatario ?? "geral") === "geral" ? "Geral" : "Financeiro";
  const nomeArquivo = body.nomeArquivo || `OS ${rotulo} - ${os.id}.pdf`;
  const anexos = [{ nome: nomeArquivo, conteudoBase64: body.pdfBase64, tipoMime: "application/pdf" }];

  // Botão "Editar antes de enviar": não baixa nem manda nada -- devolve o
  // destinatário/assunto/corpo em texto puro pro cliente abrir o Outlook direto (mailto:),
  // já com a mensagem pronta pra editar; o PDF a pessoa anexa na mão (mailto não suporta anexo).
  if (body.rascunho) {
    const corpoTexto = `Prezados(as),\n\nSegue em anexo a O.S. com todas as informações.${ehFinanceiro && os.codigo ? `\nCód. financeiro: ${os.codigo}` : ""}\n\n\nFico à disposição.\nAtenciosamente,`;
    return NextResponse.json({ ok: true, modo: "mailto", destino: para.join(","), assunto, corpoTexto, nomeArquivo });
  }

  try {
    await enviarEmail({ remetente, para, assunto, corpoHtml, anexos });
    return NextResponse.json({ ok: true, modo: "graph", enviadoPara: para.join(", "), remetente });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao enviar e-mail.";
    const status = e instanceof GraphErro ? e.status : 502;
    console.error("[paralegal/os/enviar-email] envio via Graph falhou (" + status + "): " + mensagem);
    // Plano B: não deixa o usuário sem saída -- monta o .eml com tudo pronto pra abrir no Outlook.
    const eml = construirEml({ para, assunto, corpoHtml, anexos });
    return NextResponse.json({
      ok: true,
      modo: "eml",
      avisoGraph: mensagem,
      destino: para.join(", "),
      emlBase64: Buffer.from(eml, "utf-8").toString("base64"),
      nomeArquivoEml: `OS ${rotulo} - ${os.id}.eml`,
    });
  }
}
