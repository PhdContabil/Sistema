// Trabalhista · eSocial — restrita a quem acessa o módulo Trabalhista
// (setor "trabalhista", T.I. ou Diretoria).
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import EsocialEventos from "@/components/apps/EsocialEventos";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("trabalhista")!;
  const liberado = podeAcessarApp(nivel, "trabalhista", "eSocial");

  return (
    <Workspace moduleId="trabalhista" appName="eSocial">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>ES</div>
        <div>
          <h1>eSocial</h1>
          <div className="desc">Eventos, envios e retornos ao governo.</div>
        </div>
      </div>
      {!liberado ? <AcessoNegado moduloNome="eSocial" /> : <EsocialEventos />}
    </Workspace>
  );
}
