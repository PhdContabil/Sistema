import Workspace from "@/components/Workspace";
import ApiManutencao from "@/components/apps/ApiManutencao";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("tecnologia")!;
  const user = await getCurrentUser().catch(() => null);
  const souTI = await ehDaTI(user?.email).catch(() => false);

  return (
    <Workspace moduleId="tecnologia" appName="Catálogo de Sistemas">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CS</div>
        <div>
          <h1>Catálogo de Sistemas</h1>
          <div className="desc">Sistemas em uso no escritório, responsáveis e controles operacionais.</div>
        </div>
      </div>

      <ApiManutencao souTI={souTI} />

      <div className="banner" style={{ marginTop: 18 }}>
        O restante do catálogo (lista de sistemas, responsáveis e quem tem acesso) ainda está em construção.
      </div>
    </Workspace>
  );
}
