import Workspace from "@/components/Workspace";
import Dctfweb from "@/components/apps/Dctfweb";
import { getModule } from "@/lib/modules";
import { getDctfwebObrigadas, hasApiKey } from "@/lib/questor";
import { SAMPLE_DCTFWEB } from "@/lib/sample-fiscal";
import type { DctfwebResponse } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string; origem?: string };
}) {
  const m = getModule("fiscal")!;

  let resp: DctfwebResponse = SAMPLE_DCTFWEB;
  let fonte: "api" | "exemplo" = "exemplo";
  let erro: string | null = null;

  if (hasApiKey()) {
    try {
      resp = await getDctfwebObrigadas({
        ano: searchParams.ano ? Number(searchParams.ano) : undefined,
        mes: searchParams.mes ? Number(searchParams.mes) : undefined,
        origem: searchParams.origem || undefined,
      });
      fonte = "api";
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="fiscal" appName="DCTFWeb">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>DW</div>
        <div>
          <h1>DCTFWeb</h1>
          <div className="desc">Empresas obrigadas por competência e débito apurado.</div>
        </div>
      </div>
      <Dctfweb
        resp={resp}
        fonte={fonte}
        erroServidor={erro}
        filtros={{ ano: searchParams.ano ?? "", mes: searchParams.mes ?? "", origem: searchParams.origem ?? "" }}
      />
    </Workspace>
  );
}
