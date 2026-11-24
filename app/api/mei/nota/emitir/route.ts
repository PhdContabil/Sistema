import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { emitirNotaMei, notasEmitidasMei, ambienteMei, SERVICOS_MEI, type PedidoNotaMei } from "@/lib/mei/nfse-mei";

// Emissão da NFS-e do MEI pela API do Portal Nacional (certificado da PHD + procuração do MEI).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function usuario(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") && user?.email ? user.email.toLowerCase() : null;
}

/** GET ?cod= — notas já emitidas pelo Núcleo para o MEI + serviços e ambiente. */
export async function GET(req: Request) {
  if (!(await usuario())) return NextResponse.json({ error: "Sem acesso ao Sistema MEI." }, { status: 403 });
  const cod = Number(new URL(req.url).searchParams.get("cod"));
  return NextResponse.json({ ambiente: ambienteMei(), servicos: SERVICOS_MEI, notas: cod ? await notasEmitidasMei(cod) : [] });
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return NextResponse.json({ error: "Sem acesso ao Sistema MEI." }, { status: 403 });
  let b: PedidoNotaMei;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const r = await emitirNotaMei(b, email);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
