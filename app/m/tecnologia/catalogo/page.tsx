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

      {souTI && (
        <div className="painel-api" style={{ marginTop: 18 }}>
          <div className="painel-api-head">
            <h3>Ferramentas internas</h3>
          </div>
          <div className="ferramentas">
            <a className="ferramenta" href="http://10.11.1.14:8088/" target="_blank" rel="noreferrer">
              <span className="ic mono">DB</span>
              <span>
                <strong>Monitor do banco (DBMON)</strong>
                <em>10.11.1.14:8088 — conexões, carga e sessões do PostgreSQL</em>
              </span>
              <span className="seta">↗</span>
            </a>
          </div>
          <p className="nota">
            Abre em nova aba. Só responde de dentro da rede do escritório ou por VPN —
            é um endereço interno, não fica acessível pela internet.
          </p>
        </div>
      )}

      <div className="banner" style={{ marginTop: 18 }}>
        O restante do catálogo (lista de sistemas, responsáveis e quem tem acesso) ainda está em construção.
      </div>
    </Workspace>
  );
}
