// Ações do Painel Gerencial: enviar o relatório por e-mail e cobrar um responsável.
// O servidor recalcula tudo a partir do banco — nunca confia nos dados que vêm da tela.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { enviarEmail } from "@/lib/pessoas/notificar";
import { carregarPainel } from "@/lib/paralegal/painel-dados";
import { filtrarProcessos, paraCobrar, ROTULO_ALERTA, type Filtros } from "@/lib/paralegal/painel";
import { emailCobranca, emailRelatorio } from "@/lib/paralegal/painel-email";

export const dynamic = "force-dynamic";

const ok = (e: string) => /^[^\s@]+@phdcontabil\.com\.br$/i.test(e.trim());

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ erro: "Entre com a conta da PHD." }, { status: 401 });
  const nivel = await obterNivelAcesso(user.email);
  if (!podeAcessarApp(nivel, "paralegal", "Painel Gerencial")) return NextResponse.json({ erro: "Sem acesso ao Painel Gerencial." }, { status: 403 });

  let b: { acao?: string; para?: string[]; filtros?: Filtros; responsavel?: string; processoId?: number; recado?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 }); }

  const para = [...new Set((b.para || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (para.length === 0 || para.length > 5) return NextResponse.json({ erro: "Informe de 1 a 5 e-mails." }, { status: 400 });
  if (!para.every(ok)) return NextResponse.json({ erro: "Só e-mails @phdcontabil.com.br." }, { status: 400 });

  const { hoje, lista } = await carregarPainel();

  if (b.acao === "relatorio") {
    const f = b.filtros || {};
    const ps = filtrarProcessos(lista, f);
    if (ps.length === 0) return NextResponse.json({ erro: "Nenhum processo nesse filtro." }, { status: 400 });
    const partes = [f.alerta && f.alerta !== "todos" ? ROTULO_ALERTA[f.alerta] : "", f.responsavel || "", f.status || "", f.busca ? `“${f.busca}”` : ""].filter(Boolean);
    const m = emailRelatorio(ps, lista, hoje, user.email, partes.join(" · "));
    const res = await Promise.all(para.map((p) => enviarEmail(p, m.assunto, m.html)));
    const falhas = res.filter((x) => !x).length;
    if (falhas) return NextResponse.json({ erro: `Não consegui enviar para ${falhas} destinatário(s).` }, { status: 502 });
    return NextResponse.json({ ok: true, enviados: para.length, processos: ps.length });
  }

  if (b.acao === "cobrar") {
    const resp = String(b.responsavel || "");
    const ps = paraCobrar(lista, resp, b.processoId);
    if (ps.length === 0) return NextResponse.json({ erro: "Esse responsável não tem pendência atrasada ou perto de vencer." }, { status: 400 });
    const m = emailCobranca(ps, resp, hoje, user.email, String(b.recado || "").slice(0, 600));
    const res = await Promise.all(para.map((p) => enviarEmail(p, m.assunto, m.html)));
    if (res.some((x) => !x)) return NextResponse.json({ erro: "Não consegui enviar o e-mail." }, { status: 502 });
    return NextResponse.json({ ok: true, enviados: para.length, processos: ps.length });
  }

  return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
}
