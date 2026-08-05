import Workspace from "@/components/Workspace";
import MinhasFerias from "@/components/pessoas/MinhasFerias";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, encarregadoDoSetor, type SolicitacaoFerias } from "@/lib/pessoas/ferias";

export const dynamic = "force-dynamic";

export default async function FeriasPage() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? "";
  const sb = admin();

  let perfil: { id: number; nome: string; setor: string } | null = null;
  let solicitacoes: SolicitacaoFerias[] = [];
  let chefe: { nome: string; email: string } | null = null;
  let ehEncarregado = false;

  if (sb && email) {
    const { data: p } = await sb
      .from("pessoas_perfil").select("id,nome,setor,encarregado").ilike("email", email).maybeSingle();
    if (p) {
      perfil = { id: p.id, nome: p.nome, setor: p.setor };
      ehEncarregado = Boolean(p.encarregado);
      chefe = await encarregadoDoSetor(p.setor);

      const { data: sols } = await sb
        .from("ferias_solicitacoes")
        .select("id,pessoa_id,solicitante,setor,observacao,status,aprovador,avaliado_em,motivo_recusa,criado_em,ferias_periodos(id,inicio,fim,dias)")
        .eq("pessoa_id", p.id)
        .order("criado_em", { ascending: false });

      solicitacoes = ((sols ?? []) as unknown as (SolicitacaoFerias & { ferias_periodos: { id: number; inicio: string; fim: string; dias: number }[] })[])
        .map((s) => ({ ...s, periodos: s.ferias_periodos ?? [] }));
    }
  }

  return (
    <Workspace moduleId="pessoas" appName="Férias">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 200)" }}>FE</div>
        <div>
          <h1>Férias</h1>
          <div className="desc">Solicite seus períodos e acompanhe a aprovação.</div>
        </div>
      </div>

      {!perfil ? (
        <div className="banner">
          <strong>Seu e-mail ainda não está vinculado a um cadastro em Pessoas{email ? ` (${email})` : ""}.</strong>
          <p style={{ margin: "6px 0 0" }}>Peça ao time de Tecnologia para vincular — depois disso você poderá solicitar férias.</p>
        </div>
      ) : (
        <MinhasFerias
          perfil={perfil}
          chefe={chefe}
          ehEncarregado={ehEncarregado}
          inicial={solicitacoes}
        />
      )}
    </Workspace>
  );
}
