import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin } from "@/lib/pessoas/ferias";
import { avisarCanal } from "@/lib/pessoas/notificar";
import { lerReunioes, salvarReunioes, dataBR, horario, podeAgendar, type Reuniao } from "@/lib/pessoas/reunioes";

export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/** Cria (ou altera, com id) uma reunião; opcionalmente avisa no canal do Teams. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const quem = await podeAgendar(email);
  if (!quem.ok) return NextResponse.json({ error: "Só encarregados e Gestores podem marcar reuniões." }, { status: 403 });

  let b: Partial<Reuniao> & { avisar?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const titulo = String(b.titulo ?? "").trim().slice(0, 150);
  const data = String(b.data ?? "").slice(0, 10);
  const hi = String(b.hora_inicio ?? "").slice(0, 5);
  const hf = String(b.hora_fim ?? "").slice(0, 5) || null;
  const local = String(b.local ?? "").trim().slice(0, 200);
  if (!titulo) return NextResponse.json({ error: "Informe o assunto da reunião." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Informe a data." }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(hi)) return NextResponse.json({ error: "Informe o horário de início." }, { status: 400 });
  if (hf && hf <= hi) return NextResponse.json({ error: "O horário de término deve ser depois do início." }, { status: 400 });
  if (!local) return NextResponse.json({ error: "Informe o local (sala, endereço ou Teams)." }, { status: 400 });
  const link = String(b.link ?? "").trim();
  if (link && !/^https:\/\//i.test(link)) return NextResponse.json({ error: "O link precisa começar com https://" }, { status: 400 });

  const lista = await lerReunioes();
  const existente = b.id ? lista.find((x) => x.id === Number(b.id)) : undefined;
  const r: Reuniao = {
    id: existente?.id ?? lista.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    titulo, data, hora_inicio: hi, hora_fim: hf, local,
    link: link || null,
    participantes: String(b.participantes ?? "").trim().slice(0, 300) || null,
    pauta: String(b.pauta ?? "").trim().slice(0, 2000) || null,
    criado_por: existente?.criado_por ?? email,
    criado_por_nome: existente?.criado_por_nome ?? quem.nome,
    criado_em: existente?.criado_em ?? new Date().toISOString(),
  };
  const erro = await salvarReunioes(existente ? lista.map((x) => (x.id === r.id ? r : x)) : [...lista, r]);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });

  // Agenda mensal do escritório (refaz o evento desta reunião).
  try {
    const sb = admin();
    if (sb) {
      await sb.from("eventos_agenda").delete().eq("origem", `reuniao:${r.id}`);
      await sb.from("eventos_agenda").insert({
        tipo: "reuniao", titulo: `Reunião: ${r.titulo} (${horario(r)})`, inicio: r.data, fim: r.data,
        detalhe: r.local, origem: `reuniao:${r.id}`,
      });
    }
  } catch { /* segue */ }

  if (b.avisar) {
    try {
      await avisarCanal(`📅 **Reunião${existente ? " (alterada)" : ""}: ${r.titulo}** — ${dataBR(r.data)}, ${horario(r)} · ${r.local}`
        + `${r.participantes ? ` · Participantes: ${r.participantes}` : ""}. Detalhes: ${BASE}/m/pessoas/reunioes`);
    } catch { /* segue */ }
  }
  return NextResponse.json({ ok: true, id: r.id });
}
