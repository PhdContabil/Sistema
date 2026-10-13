import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { enviarEmail, construirEml } from "@/lib/paralegal/graph";
import { gravacaoLiberada } from "@/lib/mei/api";

// Comunicado de Saída do MEI (encerramento): enviado direto pelo Microsoft 365 de quem está logado,
// para Débora e Graciele. Com a trava de cadastro ligada (ou se o envio falhar), devolve um .eml.
export const dynamic = "force-dynamic";

const PARA = (process.env.MEI_EMAIL_COMUNICADO || "debora@phdcontabil.com.br,graciele@phdcontabil.com.br")
  .split(/[,;]/).map((s) => s.trim()).filter(Boolean);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "mei", "Sistema MEI")) return NextResponse.json({ error: "Sem acesso ao Sistema MEI (setor MEI, Diretoria ou T.I.)." }, { status: 403 });
  let b: { cod?: number; razao?: string; cnpj?: string; salao?: string; data?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  if (!b.cod || !b.razao || !/^\d{4}-\d{2}-\d{2}$/.test(b.data ?? "")) return NextResponse.json({ error: "Informe a empresa e a data de saída." }, { status: 400 });

  const dataBr = b.data!.split("-").reverse().join("/");
  const assunto = `Comunicado de Saída - ${b.razao}`;
  const corpoHtml = `<p>Prezados(as),</p><p>Venho comunicar a todos o desligamento da profissional:</p>`
    + `<p><b>${esc(b.salao)}<br>${esc(b.cod)} - ${esc(b.razao)}</b><br>CNPJ: ${esc(b.cnpj)}</p>`
    + `<p>Questor: Baixada<br>Data de Saída: <span style="color:red">${dataBr}</span></p>`;
  const rascunho = (motivo: string) => new NextResponse(construirEml({ para: PARA, assunto, corpoHtml, anexos: [] }), {
    headers: { "Content-Type": "message/rfc822", "x-motivo": encodeURIComponent(motivo) },
  });

  if (!gravacaoLiberada("cadastro")) return rascunho("Trava de cadastro ligada: e-mail não enviado automaticamente.");
  if (!user?.email) return rascunho("Sem e-mail de login para usar como remetente.");
  try {
    await enviarEmail({ remetente: user.email, para: PARA, assunto, corpoHtml, anexos: [] });
    return NextResponse.json({ ok: true, para: PARA });
  } catch {
    return rascunho("O envio automático falhou.");
  }
}
