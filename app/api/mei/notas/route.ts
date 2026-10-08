import { NextResponse } from "next/server";
import { bloquearSemAcessoMei } from "@/lib/mei/guard";
import { notasMEI } from "@/lib/mei/questor-mei";

// ?competencia=YYYY-MM&cods=2001,2002 (máx. 60 códigos; a API limita 5000 linhas).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const negado = await bloquearSemAcessoMei();
  if (negado) return negado;
  const sp = new URL(req.url).searchParams;
  const comp = sp.get("competencia") ?? "";
  const cods = (sp.get("cods") ?? "").split(",").map((x) => Number(x)).filter(Boolean);
  if (!/^\d{4}-\d{2}$/.test(comp) || !cods.length) {
    return NextResponse.json({ error: "Informe competencia (AAAA-MM) e cods." }, { status: 400 });
  }
  try {
    return NextResponse.json(await notasMEI(comp, cods));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar notas." }, { status: 502 });
  }
}
