import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isAdmin } from "@/lib/societario/options";
import { tokenTareffa } from "@/lib/tareffa-documentos";

// Diagnóstico (SÓ LEITURA) da API do Tareffa para criar serviços avulsos a partir do Societário:
// confere token, busca serviço/empresa e procura a rota de usuários (responsável "alocadoPara").
export const dynamic = "force-dynamic";
const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Só admin." }, { status: 403 });
  const u = new URL(req.url);
  const H = { Authorization: `Bearer ${await tokenTareffa()}`, "Content-Type": "application/json" };
  const resumo = async (r: Response) => {
    const t = await r.text();
    let j: unknown = null;
    try { j = JSON.parse(t); } catch { /* texto */ }
    const rec = (j as { records?: unknown[] } | null)?.records;
    return { status: r.status, amostra: rec ? rec.slice(0, 5) : (j ?? t.slice(0, 300)), total: (j as { length?: number } | null)?.length };
  };
  const out: Record<string, unknown> = {};
  out.servicos = await resumo(await fetch(`${API}/servicos?page_index=0&page_size=10&ativo=true&nome=${encodeURIComponent(u.searchParams.get("servico") || "Configurar módulo")}`, { headers: H }));
  out.empresas = await resumo(await fetch(`${API}/empresas/f?page_size=5&page_index=0`, { method: "POST", headers: H, body: JSON.stringify({ descricao: u.searchParams.get("empresa") || "TESTE MODULOS", isAtivo: false }) }));
  const tentativas = (u.searchParams.get("rotas") || "/usuarios?page_index=0&page_size=5,/usuarios/f?page_index=0&page_size=5,/usuarios/ativos,/usuarios/me,/me,/colaboradores?page_index=0&page_size=5,/responsaveis?page_index=0&page_size=5,/usuarios/contabilidade").split(",");
  for (const p of tentativas) {
    try {
      const r = await fetch(API + p, { headers: H });
      out[`GET ${p}`] = await resumo(r);
      if (r.status === 405) {
        const r2 = await fetch(API + p, { method: "POST", headers: H, body: JSON.stringify({ descricao: "", nome: "" }) });
        out[`POST ${p}`] = await resumo(r2);
      }
    } catch (e) { out[p] = String(e); }
  }
  return NextResponse.json(out);
}
