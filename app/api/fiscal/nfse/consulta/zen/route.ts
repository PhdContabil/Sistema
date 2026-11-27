import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { exigirFiscal } from "../../_auth";
import { importarNfseQDrive, hasQuestorZenToken } from "@/lib/questor-zen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Item { chave: string; numero?: string; tipo: "emitida" | "recebida"; xml_gz: string }

/** POST { itens: [...] } (até 20 por chamada) — importa as NFS-e no Q-Drive do Questor Zen. */
export async function POST(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  if (!hasQuestorZenToken()) return NextResponse.json({ error: "Questor Zen não configurado no servidor (QUESTOR_ZEN_TOKEN)." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { itens?: Item[] };
  const itens = (b.itens ?? []).slice(0, 20);
  if (!itens.length) return NextResponse.json({ error: "Nenhuma nota." }, { status: 400 });
  const resultados: { chave: string; ok: boolean; mensagem?: string }[] = [];
  for (const it of itens) {
    try {
      const xml = gunzipSync(Buffer.from(it.xml_gz, "base64")).toString("utf8");
      await importarNfseQDrive(`NFSe-${it.chave}.xml`, xml, it.tipo === "emitida" ? 1 : 0);
      resultados.push({ chave: it.chave, ok: true });
    } catch (e) {
      resultados.push({ chave: it.chave, ok: false, mensagem: e instanceof Error ? e.message : "Falha." });
    }
  }
  return NextResponse.json({ resultados });
}
