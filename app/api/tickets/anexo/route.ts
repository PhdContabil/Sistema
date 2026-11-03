import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/**
 * Abre uma imagem do bucket privado "ticket-anexos" (colada em comentário/descrição de ticket).
 * Exige login e redireciona para um link assinado de 1 hora — o link público não funciona mais
 * desde que o bucket virou privado (o Supabase responde "Bucket not found").
 */
export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const caminho = new URL(req.url).searchParams.get("p") ?? "";
  if (!caminho || caminho.includes("..")) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });
  const { data, error } = await db.storage.from("ticket-anexos").createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, 302);
}
