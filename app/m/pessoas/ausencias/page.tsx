import Workspace from "@/components/Workspace";
import Ausencias from "@/components/pessoas/Ausencias";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, encarregadoDoSetor, temVisaoDeGestores, ehApoioGestaoPessoas } from "@/lib/pessoas/ferias";
import { lerAusencias, type Ausencia } from "@/lib/pessoas/ausencias";

export const dynamic = "force-dynamic";

export default async function AusenciasPage() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? "";
  const sb = admin();

  let perfil: { id: number; nome: string; setor: string } | null = null;
  let chefe: { nome: string; email: string } | null = null;
  let minhas: Ausencia[] = [];
  let paraResponder: Ausencia[] = [];
  let respondidas: Ausencia[] = [];
  let ehGestor = false;

  if (sb && email) {
    const { data: p } = await sb.from("pessoas_perfil").select("id,nome,setor,encarregado").ilike("email", email).maybeSingle();
    const todas = (await lerAusencias()).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    if (p) {
      perfil = { id: p.id, nome: p.nome, setor: p.setor };
      chefe = await encarregadoDoSetor(p.setor);
      minhas = todas.filter((a) => a.pessoa_id === p.id);
    }
    ehGestor = Boolean(p?.encarregado) || ehApoioGestaoPessoas(email);
    if (ehGestor) {
      const tudo = temVisaoDeGestores(email, p?.setor);
      const doSetor = todas.filter((a) => tudo || a.setor === p?.setor);
      paraResponder = doSetor.filter((a) => a.status === "pendente" && a.solicitante !== email);
      respondidas = doSetor.filter((a) => a.status === "aprovada" || a.status === "rejeitada").slice(0, 30);
    }
  }

  return (
    <Workspace moduleId="pessoas" appName="Ausências">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 200)" }}>AU</div>
        <div>
          <h1>Ausências</h1>
          <div className="desc">Solicitação de banco de horas e demais ausências.</div>
        </div>
      </div>

      {!perfil ? (
        <div className="banner">
          <strong>Seu e-mail ainda não está vinculado a um cadastro em Pessoas{email ? ` (${email})` : ""}.</strong>
          <p style={{ margin: "6px 0 0" }}>Peça ao time de Tecnologia para vincular — depois disso você poderá solicitar ausências.</p>
        </div>
      ) : (
        <Ausencias chefe={chefe} minhas={minhas} ehGestor={ehGestor} paraResponder={paraResponder} respondidas={respondidas} />
      )}
    </Workspace>
  );
}
