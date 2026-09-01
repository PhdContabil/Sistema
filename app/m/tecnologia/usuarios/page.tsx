// Cadastro de setor por pessoa, em nível de Núcleo — não confundir com
// /m/tecnologia/tickets/usuarios (a mesma tabela, mas aberta lá pra
// admins/sub-admins de Tickets escolherem responsável). Esta tela aqui
// controla quem acessa qual módulo do Núcleo (ver lib/acesso.ts), então só
// quem é do setor de T.I. (ou Diretoria) pode ver e editar.

import Link from "next/link";
import Workspace from "@/components/Workspace";
import TicketsUsuarios from "@/components/apps/TicketsUsuarios";
import AcessoNegado from "@/components/AcessoNegado";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const meuEmail = user?.email?.toLowerCase() ?? null;

  return (
    <Workspace moduleId="tecnologia" appName="Usuários por setor">
      <div className="app-head" style={{ marginBottom: 4 }}>
        <div>
          <h1>Usuários por setor</h1>
          <div className="desc">
            Setor de cada pessoa — define o que ela acessa no Núcleo (módulo
            do setor, Pessoas, Ponto Digital e Tickets) e quem pode ser
            atribuído a um chamado.
          </div>
        </div>
      </div>

      {!nivel.acessoTotal ? (
        <>
          <AcessoNegado moduloNome="Usuários por setor" />
          <p style={{ marginTop: 12 }}>
            <Link href="/m/tecnologia" style={{ fontSize: 13, color: "var(--accent)" }}>
              ← Voltar para Tecnologia e Inovação
            </Link>
          </p>
        </>
      ) : (
        <TicketsUsuarios meuEmail={meuEmail} />
      )}
    </Workspace>
  );
}
