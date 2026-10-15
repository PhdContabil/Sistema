import { bearerConfere } from "@/lib/seguranca";
import { NextResponse } from "next/server";
import { listaMEI } from "@/lib/mei/questor-mei";

// Fila de "Nome das pastas" do Sistema MEI — mesma ideia de /api/paralegal/pastas-fila,
// mas disparada pelo cadastro de Cliente Mensal (MEI novo no Questor, faixa 2001–3999).
// O script scripts/phddc01/nome-pastas-mei.ps1 (phddc01) chama esta rota e grava em nome_pastas.xlsx.
//
// GET ?desde=<cód. empresa> -> MEIs com código maior. Sem "desde": só devolve o maior código atual.
// Autenticação: Authorization: Bearer <PARALEGAL_PASTAS_TOKEN> (o mesmo token do Paralegal).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function properCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s])(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export async function GET(req: Request) {
  // Token próprio do MEI (MEI_PASTAS_TOKEN); aceita o do Paralegal até o script do servidor ser trocado.
  if (!bearerConfere(req, process.env.MEI_PASTAS_TOKEN, process.env.PARALEGAL_PASTAS_TOKEN)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const lista = await listaMEI(true);
  const maxCod = lista.reduce((m, x) => Math.max(m, Number(x.cod) || 0), 0);
  const desdeParam = new URL(req.url).searchParams.get("desde");
  if (desdeParam === null || desdeParam === "") return NextResponse.json({ maxNos: maxCod, itens: [] });
  const desde = Number(desdeParam) || 0;

  const itens = lista
    .filter((x) => Number(x.cod) > desde)
    .sort((a, b) => a.cod - b.cod)
    .map((x) => {
      const razao = String(x.razao ?? "").split(" LTDA").join("");
      const nome = properCase(`${razao}_${x.cod}`).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
      return { nos: x.cod, nome, tipo: "Empresa" };
    });
  return NextResponse.json({ maxNos: maxCod, itens });
}
