import { NextResponse } from "next/server";
import { listarPessoas } from "@/lib/pessoas/dados";

export const dynamic = "force-dynamic";

export async function GET() {
  const pessoas = await listarPessoas();
  return NextResponse.json({ pessoas });
}
