// Fiscal · Obrigações Acessórias — restrita a quem acessa o módulo Fiscal
// (setor "fiscal", T.I. ou Diretoria), mesma regra do resto do módulo.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import ObrigacoesAcessorias from "@/components/apps/ObrigacoesAcessorias";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("fiscal")!;
  const liberado = podeAcessarApp(nivel, "fiscal", "Obrigações Acessórias");

  return (
    <Workspace moduleId="fiscal" appName="Obrigações Acessórias">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>OA</div>
        <div>
          <h1>Obrigações Acessórias</h1>
          <div className="desc">Controle de entregas e prazos por cliente.</div>
        </div>
      </div>
      {!liberado ? <AcessoNegado moduloNome="Obrigações Acessórias" /> : <ObrigacoesAcessorias />}
    </Workspace>
  );
}
