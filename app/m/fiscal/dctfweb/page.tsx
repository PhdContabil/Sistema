import Workspace from "@/components/Workspace";
import Dctfweb from "@/components/apps/Dctfweb";
import { getModule } from "@/lib/modules";

export default function Page() {
  const m = getModule("fiscal")!;
  return (
    <Workspace moduleId="fiscal" appName="DCTFWeb">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>DW</div>
        <div>
          <h1>DCTFWeb</h1>
          <div className="desc">Empresas obrigadas por competência e débito apurado.</div>
        </div>
      </div>
      <Dctfweb />
    </Workspace>
  );
}
