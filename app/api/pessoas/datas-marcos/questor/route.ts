// Sincroniza a data de admissão com o Questor (botão na aba Experiência).
import { NextResponse } from "next/server";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";
import { sincronizarAdmissoesQuestor } from "@/lib/pessoas/datas-marcos-lembretes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const q = await quemEstaAqui();
  if (!q.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!q.rh) return NextResponse.json({ error: "Só o RH sincroniza com o Questor." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await sincronizarAdmissoesQuestor()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Questor." }, { status: 502 });
  }
}
