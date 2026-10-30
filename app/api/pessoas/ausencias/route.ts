import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, encarregadoDoSetor } from "@/lib/pessoas/ferias";
import { enviarEmail, notificarTeams, layoutEmail } from "@/lib/pessoas/notificar";
import { lerAusencias, salvarAusencias, quando, TIPOS_AUSENCIA, type Ausencia } from "@/lib/pessoas/ausencias";

export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Nova solicitação de ausência; avisa o encarregado do setor (e-mail + Teams). */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  let b: { tipo?: string; data?: string; data_fim?: string; dia_inteiro?: boolean; hora_inicio?: string; hora_fim?: string; motivo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const tipo = TIPOS_AUSENCIA[b.tipo ?? ""] ? String(b.tipo) : "outro";
  const data = String(b.data ?? "").slice(0, 10);
  const dataFim = String(b.data_fim || data).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Informe o dia." }, { status: 400 });
  if (dataFim < data) return NextResponse.json({ error: "O último dia não pode ser antes do primeiro." }, { status: 400 });
  const diaInteiro = !!b.dia_inteiro;
  const hi = diaInteiro ? null : String(b.hora_inicio ?? "").slice(0, 5);
  const hf = diaInteiro ? null : String(b.hora_fim ?? "").slice(0, 5);
  if (!diaInteiro && (!/^\d{2}:\d{2}$/.test(hi ?? "") || !/^\d{2}:\d{2}$/.test(hf ?? "") || (hf ?? "") <= (hi ?? ""))) {
    return NextResponse.json({ error: "Informe o horário (início e fim) ou marque dia inteiro." }, { status: 400 });
  }

  const { data: perfil } = await sb.from("pessoas_perfil").select("id,nome,setor").ilike("email", email).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "Seu e-mail ainda não está vinculado a um cadastro em Pessoas." }, { status: 400 });

  const lista = await lerAusencias();
  const nova: Ausencia = {
    id: lista.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    pessoa_id: perfil.id, nome: perfil.nome, setor: perfil.setor, solicitante: email,
    tipo, data, data_fim: dataFim, dia_inteiro: diaInteiro, hora_inicio: hi, hora_fim: hf,
    motivo: String(b.motivo ?? "").trim().slice(0, 500) || null,
    status: "pendente", aprovador: null, aprovador_nome: null, avaliado_em: null, resposta: null,
    criado_em: new Date().toISOString(),
  };
  const erro = await salvarAusencias([...lista, nova]);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });

  const chefe = await encarregadoDoSetor(perfil.setor);
  const link = `${BASE}/m/pessoas/ausencias`;
  if (chefe?.email) {
    const resumo = `${TIPOS_AUSENCIA[tipo]} — ${quando(nova)}`;
    try {
      await enviarEmail(chefe.email, `Ausência — ${perfil.nome} aguarda sua resposta`, layoutEmail(
        "Nova solicitação de ausência",
        `<p><strong>${esc(perfil.nome)}</strong> (${esc(perfil.setor)}) pediu uma ausência.</p>
         <p><strong>${esc(resumo)}</strong></p>
         ${nova.motivo ? `<p><strong>Motivo:</strong> ${esc(nova.motivo)}</p>` : ""}
         <p>Confirme ou negue pelo Núcleo.</p>`,
        { texto: "Responder", url: link }
      ));
      await notificarTeams(chefe.email, "Nova solicitação de ausência", `${perfil.nome} (${perfil.setor}) pediu: ${resumo}.`, link);
    } catch { /* aviso não trava o pedido */ }
  }
  return NextResponse.json({ ok: true, id: nova.id, encarregado: chefe?.nome ?? null });
}
