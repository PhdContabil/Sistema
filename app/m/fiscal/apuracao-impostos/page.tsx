// Fiscal · Apuração de Impostos — restrita a quem acessa o módulo Fiscal
// (setor "fiscal", T.I. ou Diretoria), mesma regra do resto do módulo.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import ApuracaoImpostos from "@/components/apps/ApuracaoImpostos";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";
import { getIcmsDifal, hasApiKey } from "@/lib/questor";
import { SAMPLE_DIFAL } from "@/lib/sample-fiscal";
import type { IcmsDifalResponse } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("fiscal")!;
  const liberado = podeAcessarApp(nivel, "fiscal", "Apuração de Impostos");

  let difal: IcmsDifalResponse = SAMPLE_DIFAL;
  let difalFonte: "api" | "exemplo" = "exemplo";
  let difalErro: string | null = null;

  if (liberado && hasApiKey()) {
    try {
      difal = await getIcmsDifal({ meses: 6 });
      difalFonte = "api";
    } catch (e) {
      difalErro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="fiscal" appName="Apuração de Impostos">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>AI</div>
        <div>
          <h1>Apuração de Impostos</h1>
          <div className="desc">Cálculo de ICMS, PIS, COFINS e IPI por competência.</div>
        </div>
      </div>
      {!liberado ? (
        <AcessoNegado moduloNome="Apuração de Impostos" />
      ) : (
        <ApuracaoImpostos difal={difal} difalFonte={difalFonte} difalErro={difalErro} />
      )}
    </Workspace>
  );
}
