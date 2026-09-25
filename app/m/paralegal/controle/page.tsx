// Paralegal · Controle — migrado do Paralegal System (clientes, empresas,
// contratos, OS, indicações e roteiro de troca). Mesma regra de acesso do
// resto do módulo Paralegal: quem acessa o módulo, acessa o Controle.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import Controle from "@/components/apps/paralegal/Controle";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("paralegal")!;
  const liberado = podeAcessarApp(nivel, "paralegal", "Controle");

  return (
    <Workspace moduleId="paralegal" appName="Controle">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CO</div>
        <div>
          <h1>Controle</h1>
          <div className="desc">Clientes, contratos, ordens de serviço, indicações e roteiro de troca.</div>
        </div>
      </div>
      {!liberado ? <AcessoNegado moduloNome="Controle" /> : <Controle />}
    </Workspace>
  );
}
