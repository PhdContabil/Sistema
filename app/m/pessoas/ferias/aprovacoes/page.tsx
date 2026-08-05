import Workspace from "@/components/Workspace";
import Aprovacoes from "@/components/pessoas/Aprovacoes";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, type SolicitacaoFerias } from "@/lib/pessoas/ferias";

export const dynamic = "force-dynamic";

export default async function AprovacoesPage() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? "";
  const sb = admin();

  let ehEncarregado = false;
  let setor = "";
  let pendentes: SolicitacaoFerias[] = [];
  let historico: SolicitacaoFerias[] = [];

  if (sb && email) {
    const { data: p } = await sb
      .from("pessoas_perfil").select("setor,encarregado").ilike("email", email).maybeSingle();
    ehEncarregado = Boolean(p?.encarregado);
    setor = p?.setor ?? "";

    if (ehEncarregado) {
      const ehGestor = setor === "Gestores";
      const q = sb
        .from("ferias_solicitacoes")
        .select("id,pessoa_id,solicitante,setor,observacao,status,aprovador,avaliado_em,motivo_recusa,criado_em,ferias_periodos(id,inicio,fim,dias),pessoas_perfil(nome)")
        .order("criado_em", { ascending: false });
      // Gestores veem tudo; encarregado vê o próprio setor
      const { data } = ehGestor ? await q : await q.eq("setor", setor);

      const todas = ((data ?? []) as unknown as (SolicitacaoFerias & {
        ferias_periodos: { id: number; inicio: string; fim: string; dias: number }[];
        pessoas_perfil: { nome: string } | null;
      })[]).map((s) => ({ ...s, periodos: s.ferias_periodos ?? [], pessoa_nome: s.pessoas_perfil?.nome }));

      pendentes = todas.filter((s) => s.status === "pendente");
      historico = todas.filter((s) => s.status !== "pendente").slice(0, 30);
    }
  }

  return (
    <Workspace moduleId="pessoas" appName="Aprovar férias">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 200)" }}>AF</div>
        <div>
          <h1>Aprovar férias</h1>
          <div className="desc">
            {ehEncarregado
              ? setor === "Gestores" ? "Solicitações de todos os setores." : `Solicitações do ${setor}.`
              : "Área restrita aos encarregados."}
          </div>
        </div>
      </div>

      {!ehEncarregado ? (
        <div className="banner">
          <strong>Esta tela é para encarregados.</strong>
          <p style={{ margin: "6px 0 0" }}>Se você é responsável por um setor, peça ao time de Tecnologia para marcar seu cadastro como encarregado.</p>
        </div>
      ) : (
        <Aprovacoes pendentes={pendentes} historico={historico} />
      )}
    </Workspace>
  );
}
