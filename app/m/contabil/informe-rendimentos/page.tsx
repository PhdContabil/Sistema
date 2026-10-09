import Workspace from "@/components/Workspace";
import SistemaContabil from "@/components/apps/SistemaContabil";
import { getModule } from "@/lib/modules";
import { getEmpresas, hasApiKey } from "@/lib/questor";
import { listarLog, type LinhaLog } from "@/lib/informe-rendimentos-log";
import { listarLog as listarLogLucros, type LinhaLogLucro } from "@/lib/lucros-distribuidos-log";
import { exigirContabil } from "@/app/api/contabil/informe-rendimentos/_auth";
import AcessoNegado from "@/components/AcessoNegado";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("contabil")!;

  // Mesmo critério da API: quem não tem o módulo não carrega nem a lista de clientes.
  const email = await exigirContabil();
  if (!email) {
    return (
      <Workspace moduleId="contabil" appName="Sistema Contábil">
        <AcessoNegado moduloNome="Sistema Contábil" />
      </Workspace>
    );
  }

  let empresas: Array<{ codigo: number; nome: string }> = [];
  let log: LinhaLog[] = [];
  let logLucros: LinhaLogLucro[] = [];
  let erro: string | null = null;

  if (!hasApiKey()) {
    erro = "QUESTOR_API_KEY não configurada no servidor.";
  } else {
    try {
      const r = await getEmpresas(true);
      empresas = (r.dados ?? [])
        .filter((e) => e.ativa && e.codigoempresa < 9000 && (e.cnpj ?? "").replace(/\D/g, "").length === 14)
        .map((e) => ({ codigo: e.codigoempresa, nome: e.nome ?? "" }))
        .sort((a, b) => a.codigo - b.codigo);
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }
  try { log = await listarLog(100); } catch { /* o log é acessório: a tela funciona sem ele */ }
  try { logLucros = await listarLogLucros(100); } catch { /* idem */ }

  return (
    <Workspace moduleId="contabil" appName="Sistema Contábil">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>IR</div>
        <div>
          <h1>Sistema Contábil</h1>
          <div className="desc">
            Informe de rendimentos, aluguéis e ganho de capital (regime vem do Tareffa) e lucros distribuídos, lançados no Questor.
          </div>
        </div>
      </div>
      <SistemaContabil empresas={empresas} logInforme={log} logLucros={logLucros} erroServidor={erro} />
    </Workspace>
  );
}
