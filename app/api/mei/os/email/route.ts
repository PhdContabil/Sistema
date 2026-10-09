import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { enviarEmail, construirEml } from "@/lib/paralegal/graph";
import { chamar, gravacaoLiberada } from "@/lib/mei/api";

// E-mail da O.S. do MEI (menuos do Access): Financeiro -> graciele@ e debora@; Geral -> Geral@.
// Com a trava de O.S. ligada (ou se o envio pelo Graph falhar), devolve um .eml para abrir no Outlook.
export const dynamic = "force-dynamic";

const lista = (v: string) => v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
const PARA: Record<string, string[]> = {
  financeiro: lista(process.env.MEI_EMAIL_FINANCEIRO || "graciele@phdcontabil.com.br,debora@phdcontabil.com.br"),
  geral: lista(process.env.MEI_EMAIL_GERAL || "geral@phdcontabil.com.br"),
};

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "mei", "Sistema MEI")) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  let b: { nos?: number; publico?: string; pdfBase64?: string; nomeArquivo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const para = PARA[b.publico ?? ""];
  if (!b.nos || !para || !b.pdfBase64) return NextResponse.json({ error: "Informe a O.S., o público e o PDF." }, { status: 400 });

  const r = await chamar("GET", `/mei/os/${b.nos}`, { usuario: user?.email ?? null });
  const os = (r.json as { dados?: { tipo?: string; razao?: string }[] })?.dados?.[0];
  if (r.status !== 200 || !os) return NextResponse.json({ error: `O.S. ${b.nos} não encontrada.` }, { status: 404 });

  const assunto = `${(os.tipo || "O.S.").trim()} - ${os.razao ?? ""} - O.S. nº: ${b.nos}`;
  const corpoHtml = "<p>Prezados(as),</p><p>Segue em anexo a O.S. com todas as informações.</p>";
  const anexos = [{ nome: b.nomeArquivo || `OS ${b.nos}.pdf`, conteudoBase64: b.pdfBase64, tipoMime: "application/pdf" }];
  const rascunho = (motivo: string) => new NextResponse(construirEml({ para, assunto, corpoHtml, anexos }), {
    headers: { "Content-Type": "message/rfc822", "x-motivo": encodeURIComponent(motivo) },
  });

  if (!gravacaoLiberada("os")) return rascunho("Trava de O.S. ligada: e-mail não enviado automaticamente.");
  if (!user?.email) return rascunho("Sem e-mail de login para usar como remetente.");
  try {
    await enviarEmail({ remetente: user.email, para, assunto, corpoHtml, anexos });
    return NextResponse.json({ ok: true, para });
  } catch {
    return rascunho("O envio automático falhou.");
  }
}
