// Trabalhista · Convenções Coletivas — sindicatos cadastrados e pesquisas no Mediador (MTE).
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import ConvencoesColetivas from "@/components/apps/trabalhista/ConvencoesColetivas";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("trabalhista")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "trabalhista", "Convenções Coletivas");

  return (
    <Workspace moduleId="trabalhista" appName="Convenções Coletivas">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CC</div>
        <div>
          <h1>Convenções Coletivas</h1>
          <div className="desc">Sindicatos por nome e CNPJ, pesquisas programadas e consulta no Mediador com o formulário já preenchido.</div>
        </div>
      </div>
      {liberado ? <ConvencoesColetivas /> : <AcessoNegado moduloNome="Convenções Coletivas" />}
    </Workspace>
  );
}
