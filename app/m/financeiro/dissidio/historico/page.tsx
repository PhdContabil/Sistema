import Link from "next/link";
import Workspace from "@/components/Workspace";
import { getModule } from "@/lib/modules";
import { resumoRodadas, historicoDoAno, formatBRL, formatPct } from "@/lib/dissidio";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const m = getModule("financeiro")!;
  const rodadas = await resumoRodadas().catch(() => []);

  const pedido = Number(searchParams?.ano);
  const anoDetalhe = rodadas.some((r) => r.ano === pedido) ? pedido : null;
  const detalhe = anoDetalhe ? await historicoDoAno(anoDetalhe).catch(() => []) : [];

  return (
    <Workspace moduleId="financeiro" appName="Histórico de Dissídio">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>HD</div>
        <div>
          <h1>Histórico de Dissídio</h1>
          <div className="desc">Rodadas anteriores, lado a lado, como foram decididas na época.</div>
        </div>
      </div>

      <div className="toolbar">
        <Link className="btn" href="/m/financeiro/dissidio">← Voltar à análise</Link>
        <span className="contador">{rodadas.length} rodada{rodadas.length === 1 ? "" : "s"}</span>
      </div>

      {rodadas.length === 0 ? (
        <div className="banner">
          Nenhuma rodada registrada ainda. Ao abrir a Análise de Dissídio de um ano, a rodada é criada.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">% geral</th>
                <th className="num">Empresas ajustadas</th>
                <th className="num">Base congelada</th>
                <th className="num">Valor decidido</th>
                <th className="num">Diferença</th>
                <th className="num">% efetivo</th>
                <th>Última alteração</th>
                <th>Observação do ano</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rodadas.map((r) => {
                const dif = r.soma_nova - r.soma_base;
                const efetivo = r.soma_base > 0 ? (dif / r.soma_base) * 100 : null;
                return (
                  <tr key={r.ano}>
                    <td><strong>{r.ano}</strong>{r.fechada && <span className="tag-inativa">fechada</span>}</td>
                    <td className="num">{formatPct(r.percentual_geral)}</td>
                    <td className="num">{r.com_ajuste}</td>
                    <td className="num">{r.soma_base > 0 ? formatBRL(r.soma_base) : "—"}</td>
                    <td className="num">{r.soma_nova > 0 ? formatBRL(r.soma_nova) : "—"}</td>
                    <td className={`num ${dif < 0 ? "res-div" : ""}`}>{r.soma_base > 0 ? formatBRL(dif) : "—"}</td>
                    <td className="num">{formatPct(efetivo)}</td>
                    <td className="cnpj">
                      {r.atualizada_por ?? "—"}
                      {r.atualizada_em && <><br />{new Date(r.atualizada_em).toLocaleString("pt-BR")}</>}
                    </td>
                    <td className="atividade" title={r.observacao ?? ""}>{r.observacao ?? "—"}</td>
                    <td>
                      <Link className="btn" href={`/m/financeiro/dissidio/historico?ano=${r.ano}`}>
                        Ver decisões
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {anoDetalhe && (
        <>
          <h3 style={{ marginTop: 26 }}>Decisões registradas em {anoDetalhe}</h3>
          {detalhe.length === 0 ? (
            <div className="banner">Nenhum ajuste individual nesta rodada.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="num">Empresa</th>
                    <th className="num">Base na decisão</th>
                    <th className="num">%</th>
                    <th className="num">Valor decidido</th>
                    <th>Informado como</th>
                    <th>Observação</th>
                    <th>Analisado por</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.map((a) => {
                    const base = Number(a.valor_base ?? 0);
                    const novo =
                      a.origem === "valor" && a.valor_novo !== null
                        ? Number(a.valor_novo)
                        : a.percentual !== null
                          ? base * (1 + Number(a.percentual) / 100)
                          : base;
                    const pct =
                      a.percentual !== null
                        ? Number(a.percentual)
                        : base > 0
                          ? ((novo - base) / base) * 100
                          : null;
                    return (
                      <tr key={a.codigoempresa}>
                        <td className="num">#{a.codigoempresa}</td>
                        <td className="num">{base > 0 ? formatBRL(base) : "—"}</td>
                        <td className="num">{formatPct(pct)}</td>
                        <td className="num">{formatBRL(novo)}</td>
                        <td className="regime">{a.origem === "valor" ? "Valor em reais" : "Percentual"}</td>
                        <td className="atividade" title={a.observacao ?? ""}>{a.observacao ?? "—"}</td>
                        <td className="regime">{a.analista_nome ?? "—"}</td>
                        <td className="cnpj">
                          {a.analisado_em ? new Date(a.analisado_em).toLocaleString("pt-BR") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="footnote">
        Os valores desta tela vêm do que ficou <strong>congelado na hora da decisão</strong> — a base
        registrada em cada ajuste — e não do honorário vigente hoje. Por isso o histórico não muda
        quando um contrato é renegociado depois. Empresas que apenas seguiram o percentual geral, sem
        ajuste individual, não têm base congelada e por isso não entram nas somas acima.
      </p>
    </Workspace>
  );
}
