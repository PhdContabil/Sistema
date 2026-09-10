import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/**
 * Bucket de Storage do próprio Supabase do Núcleo, usado pelas imagens coladas
 * ou anexadas num comentário — diferente do storage do sistema antigo de
 * tickets (onde os anexos migrados em 24/08/2026 continuam). Precisa existir
 * e estar público pra leitura; ver README/instruções de criação do bucket.
 */
const BUCKET = "ticket-anexos";
const LIMITE_BYTES = 10 * 1024 * 1024; // 10MB — mesmo limite do sistema antigo

/** Sobe uma imagem pro Storage e registra em ticket_attachments — usado pelo
 * "colar" (Ctrl+V), arrastar-e-soltar e o botão de anexar do comentário. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo obrigatório." }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Só imagens são aceitas aqui." }, { status: 400 });
  }
  if (file.size > LIMITE_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande (limite 10MB)." }, { status: 400 });
  }

  const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${params.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type || "image/png", upsert: false });
  if (upErr) {
    return NextResponse.json(
      {
        error:
          `Falha ao gravar no Storage: ${upErr.message}. Confira se o bucket "${BUCKET}" ` +
          "existe e está marcado como público no Supabase do Núcleo.",
      },
      { status: 500 }
    );
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await db
    .from("ticket_attachments")
    .insert({
      ticket_id: params.id,
      url: pub.publicUrl,
      filename: file.name || null,
      uploaded_by_email: email,
    })
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, anexo: data });
}
