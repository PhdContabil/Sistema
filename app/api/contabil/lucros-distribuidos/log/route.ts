import { NextResponse } from "next/server";
import { listarLog } from "@/lib/lucros-distribuidos-log";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await exigirContabil())) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });
  try {
    return NextResponse.json({ log: await listarLog(2000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o log." }, { status: 500 });
  }
}
