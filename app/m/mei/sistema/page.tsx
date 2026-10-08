// MEI · Sistema MEI — migração do "MEI System" (app local em Node) para o Núcleo.
// Submódulo restrito à T.I. enquanto a migração é validada.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import SistemaMei from "@/components/apps/mei/SistemaMei";
import ModuloIcon from "@/components/ModuloIcon";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("mei")!;
  const liberado = podeAcessarApp(nivel, "mei", "Sistema MEI");

  return (
    <Workspace moduleId="mei" appName="Sistema MEI">
      <div className="app-head">
        <div className="app-ic" style={{ background: m.color }}><ModuloIcon id="mei" /></div>
        <div>
          <h1>Sistema MEI</h1>
          <div className="desc">Clientes, ficha, avulsos, notas e relatórios da carteira MEI (dados do Questor).</div>
        </div>
      </div>
      {!liberado ? <AcessoNegado moduloNome="Sistema MEI" /> : <SistemaMei />}
    </Workspace>
  );
}
