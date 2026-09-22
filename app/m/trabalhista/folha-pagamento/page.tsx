// Trabalhista · Folha de Pagamento — restrita a quem acessa o módulo
// Trabalhista (setor "trabalhista", T.I. ou Diretoria).
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import FolhaPagamento from "@/components/apps/FolhaPagamento";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";
import { getFuncionariosAtivos, getEmpresas, hasApiKey } from "@/lib/questor";
import { SAMPLE_SUGESTOES_FUNCIONARIOS } from "@/lib/sample-trabalhista";
import type { SugestaoFuncionario } from "@/lib/trabalhista";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("trabalhista")!;
  const liberado = podeAcessarApp(nivel, "trabalhista", "Folha de Pagamento");

  let sugestoes: SugestaoFuncionario[] = SAMPLE_SUGESTOES_FUNCIONARIOS;
  let sugestoesFonte: "api" | "exemplo" = "exemplo";
  let sugestoesErro: string | null = null;

  if (liberado && hasApiKey()) {
    try {
      const [funcionariosResp, empresasResp] = await Promise.all([getFuncionariosAtivos(), getEmpresas()]);
      const nomeEmpresa = new Map(empresasResp.dados.map((e) => [e.codigoempresa, e.nome ?? `Empresa ${e.codigoempresa}`]));
      sugestoes = funcionariosResp.dados.map((f) => ({
        nome: f.nomefunc,
        empresa: nomeEmpresa.get(f.codigoempresa) ?? null,
      }));
      sugestoesFonte = "api";
    } catch (e) {
      sugestoesErro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="trabalhista" appName="Folha de Pagamento">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>FP</div>
        <div>
          <h1>Folha de Pagamento</h1>
          <div className="desc">Cálculo de salários, encargos e benefícios.</div>
        </div>
      </div>
      {!liberado ? (
        <AcessoNegado moduloNome="Folha de Pagamento" />
      ) : (
        <FolhaPagamento sugestoes={sugestoes} sugestoesFonte={sugestoesFonte} sugestoesErro={sugestoesErro} />
      )}
    </Workspace>
  );
}
