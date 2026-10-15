import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { dentroDoLimite } from "@/lib/seguranca";

// Consulta pública de CNPJ (Receita) com reserva: BrasilAPI e, se ela falhar, publica.cnpj.ws.
// Devolve sempre no formato da BrasilAPI (é o que os formulários do Paralegal/MEI esperam).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Obj = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

async function brasilApi(cnpj: string): Promise<Obj | "404" | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (r.status === 404) return "404";
    if (!r.ok) return null;
    return (await r.json()) as Obj;
  } catch { return null; }
}

async function cnpjWs(cnpj: string): Promise<Obj | "404" | null> {
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (r.status === 404 || r.status === 400) return "404";
    if (!r.ok) return null;
    const d = (await r.json()) as Obj;
    const e = (d.estabelecimento ?? {}) as Obj;
    const cidade = (e.cidade ?? {}) as Obj; const estado = (e.estado ?? {}) as Obj; const ativ = (e.atividade_principal ?? {}) as Obj;
    return {
      cnpj, razao_social: s(d.razao_social), nome_fantasia: s(e.nome_fantasia),
      descricao_tipo_de_logradouro: s(e.tipo_logradouro), logradouro: s(e.logradouro), numero: s(e.numero),
      complemento: s(e.complemento), bairro: s(e.bairro), cep: s(e.cep), municipio: s(cidade.nome), uf: s(estado.sigla),
      ddd_telefone_1: `${s(e.ddd1)}${s(e.telefone1)}`, email: s(e.email), data_inicio_atividade: s(e.data_inicio_atividade),
      cnae_fiscal: s(ativ.subclasse ?? ativ.id), cnae_fiscal_descricao: s(ativ.descricao), fonte: "cnpj.ws",
    };
  } catch { return null; }
}

export async function GET(_req: Request, { params }: { params: { cnpj: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!dentroDoLimite(`cnpj:${user.email}`, 30)) return NextResponse.json({ error: "Muitas consultas seguidas. Aguarde um minuto." }, { status: 429 });
  const cnpj = String(params.cnpj).replace(/\D/g, "");
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  const a = await brasilApi(cnpj);
  if (a && a !== "404") return NextResponse.json(a);
  const b = await cnpjWs(cnpj);
  if (b && b !== "404") return NextResponse.json(b);
  if (a === "404" || b === "404") return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 });
  return NextResponse.json({ error: "Consulta de CNPJ fora do ar (Receita). Preencha manualmente ou tente em alguns minutos." }, { status: 502 });
}
