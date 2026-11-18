// Trabalhista · DCTFWeb (compartilhada com o Fiscal) — obrigadas (Questor), situação na Receita, guia, recibo,
// transmissão e a rotina automática. Mesmos dados e controle da tela do Fiscal.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import Dctfweb from "@/components/apps/Dctfweb";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("trabalhista")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "trabalhista", "DCTFWeb");

  return (
    <Workspace moduleId="trabalhista" appName="DCTFWeb">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>DW</div>
        <div>
          <h1>DCTFWeb</h1>
          <div className="desc">Obrigadas por competência, situação na Receita, guia, recibo e transmissão via Integra Contador. Controle compartilhado com o Fiscal.</div>
        </div>
      </div>
      {liberado ? <Dctfweb /> : <AcessoNegado moduloNome="DCTFWeb" />}
    </Workspace>
  );
}
