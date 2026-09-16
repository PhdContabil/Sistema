// Inventário de T.I. — notebooks/desktops em uso, notebooks em estoque no
// CPD, periféricos e especificações do servidor. Mesma regra de acesso do
// resto de Tecnologia fora de Tickets: só T.I./Diretoria (ver
// podeAcessarAppTecnologia em lib/acesso.ts) — mesmo padrão de
// /m/tecnologia/usuarios.

import Link from "next/link";
import Workspace from "@/components/Workspace";
import InventarioTI from "@/components/apps/InventarioTI";
import AcessoNegado from "@/components/AcessoNegado";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("tecnologia")!;

  return (
    <Workspace moduleId="tecnologia" appName="Inventário de TI">
      <div className="app-head" style={{ marginBottom: 4 }}>
        <div className="app-ic mono" style={{ background: m.color }}>IN</div>
        <div>
          <h1>Inventário de TI</h1>
          <div className="desc">
            Equipamentos alocados por pessoa, notebooks em estoque no CPD,
            periféricos e as especificações do servidor.
          </div>
        </div>
      </div>

      {!nivel.acessoTotal ? (
        <>
          <AcessoNegado moduloNome="Inventário de TI" />
          <p style={{ marginTop: 12 }}>
            <Link href="/m/tecnologia" style={{ fontSize: 13, color: "var(--accent)" }}>
              ← Voltar para Tecnologia e Inovação
            </Link>
          </p>
        </>
      ) : (
        <InventarioTI />
      )}
    </Workspace>
  );
}
