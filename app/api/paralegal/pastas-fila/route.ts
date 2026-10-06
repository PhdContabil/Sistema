import { NextResponse } from "next/server";
import { listarOS } from "@/lib/paralegal/os";

// Fila de "Nome das pastas" — substitui a automação do Access (Salvar da OS
// em formostroca) que gravava em T:\Nome pastas\nome_pastas.xlsx. O Núcleo roda
// na nuvem e não enxerga o T:, então um script agendado no phddc01
// (scripts/phddc01/nome-pastas.ps1) chama esta rota e escreve na planilha.
//
// Mesma regra do Access: OS do tipo Abertura ou Troca, com código Questor e
// documento CNPJ. Nome = razão sem " LTDA" + "_" + questor, em "Proper Case".
//
// GET ?desde=<nº OS>  -> OS com Nº maior que esse.  Sem "desde": só devolve o
// maior Nº OS atual (o script usa na 1ª execução pra não reprocessar o histórico).
// Autenticação: header Authorization: Bearer <PARALEGAL_PASTAS_TOKEN>.
export const dynamic = "force-dynamic";

function properCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s])(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export async function GET(req: Request) {
  const token = process.env.PARALEGAL_PASTAS_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const desdeParam = new URL(req.url).searchParams.get("desde");
  const lista = await listarOS();
  const maxNos = lista.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  if (desdeParam === null || desdeParam === "") {
    return NextResponse.json({ maxNos, itens: [] });
  }
  const desde = Number(desdeParam) || 0;

  const itens = lista
    .filter((o) => Number(o.id) > desde)
    .filter((o) => ["abertura", "troca"].includes(String(o.tipo ?? "").trim().toLowerCase()))
    .filter((o) => Number(String(o.questor ?? "").replace(/\D/g, "")) > 0)
    .filter((o) => String(o.cnpj ?? "").replace(/\D/g, "").length === 14)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((o) => {
      const questor = String(o.questor).replace(/\D/g, "");
      const razao = String(o.razao ?? "").split(" LTDA").join("");
      // Tira caracteres que o Windows não aceita em nome de pasta (ex.: "S/A") --
      // o criador de pastas (python no phddc01) usa o nome direto no MD.
      const nome = properCase(`${razao}_${questor}`).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
      return { nos: Number(o.id), nome, tipo: "Empresa" };
    });

  return NextResponse.json({ maxNos, itens });
}
