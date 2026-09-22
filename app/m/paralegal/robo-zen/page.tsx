// Tela do Robô Zen dentro do módulo Paralegal. Acesso pela MESMA regra de
// quem já acessa "paralegal" hoje (lib/acesso.ts) — sem permissão granular
// nova, igual ao combinado com a Júlia. A tela em si é só o wrapper padrão
// do Núcleo (Workspace + app-head) + checagem de acesso; toda a lógica viva
// (simulação, consulta, envio) está no componente cliente RoboZen.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import RoboZen from "@/components/apps/RoboZen";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function RoboZenPage() {
  const m = getModule("paralegal")!;

  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "paralegal", "Robô Zen");

  return (
    <Workspace moduleId="paralegal" appName="Robô Zen">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>RZ</div>
        <div>
          <h1>Robô Zen</h1>
          <div className="desc">
            Varre os contratos das empresas no SharePoint e cadastra os elegíveis no Questor Zen (Edoc).
          </div>
        </div>
      </div>

      {!liberado ? (
        <AcessoNegado moduloNome="Paralegal" />
      ) : (
        <RoboZen userEmail={user?.email ?? ""} />
      )}
    </Workspace>
  );
}
