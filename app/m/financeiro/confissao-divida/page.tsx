import { unstable_noStore as semCache } from "next/cache";
import Workspace from "@/components/Workspace";
import ConfissaoDivida from "@/components/apps/ConfissaoDivida";
import AcessoNegado from "@/components/AcessoNegado";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEmpresas, hasApiKey, type EmpresaCadastro } from "@/lib/questor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP = "Termo de Confissão de Dívida";

export default async function Page() {
  semCache();
  const m = getModule("financeiro")!;

  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "financeiro", APP)) {
    return (
      <Workspace moduleId="financeiro" appName={APP}>
        <AcessoNegado moduloNome="Financeiro" />
      </Workspace>
    );
  }

  let empresas: EmpresaCadastro[] = [];
  let erro: string | null = null;
  if (!hasApiKey()) {
    erro = "QUESTOR_API_KEY não configurada no servidor.";
  } else {
    try {
      // Inclui empresas encerradas: o devedor pode já ter sido baixado.
      const r = await getEmpresas(false);
      empresas = (r.dados ?? []).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="financeiro" appName={APP}>
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CD</div>
        <div>
          <h1>{APP}</h1>
          <div className="desc">Gera o contrato com as empresas escolhidas e os boletos em aberto, em PDF.</div>
        </div>
      </div>
      <ConfissaoDivida empresas={empresas} erroServidor={erro} />
    </Workspace>
  );
}
