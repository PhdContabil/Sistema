import { unstable_noStore as semCache } from "next/cache";
import Workspace from "@/components/Workspace";
import RodaVida from "@/components/pessoas/RodaVida";
import PainelRodaDiretoria from "@/components/pessoas/PainelRodaDiretoria";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { rodaAtual, historico, ehDiretoria, painelDiretoria, emailPessoal } from "@/lib/roda-vida";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // Dado pessoal: nunca de cache.
  semCache();

  const m = getModule("pessoas")!;
  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;
  const souDiretoria = ehDiretoria(meuEmail);

  const [roda, anteriores, painel, pessoal] = await Promise.all([
    meuEmail ? rodaAtual(meuEmail) : Promise.resolve(null),
    meuEmail ? historico(meuEmail) : Promise.resolve([]),
    souDiretoria ? painelDiretoria() : Promise.resolve([]),
    meuEmail ? emailPessoal(meuEmail) : Promise.resolve(null),
  ]);

  return (
    <Workspace moduleId="pessoas" appName="Roda da Vida">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>RV</div>
        <div>
          <h1>Roda da Vida</h1>
          <div className="desc">
            Um retrato de como está a sua vida hoje — e um primeiro passo para o que
            você quiser cuidar.
          </div>
        </div>
      </div>

      <RodaVida
        rodaInicial={roda}
        historicoInicial={anteriores}
        meuEmail={meuEmail}
        souDiretoria={souDiretoria}
        emailPessoalInicial={pessoal}
      />

      {souDiretoria && <PainelRodaDiretoria inicial={painel} />}
    </Workspace>
  );
}
