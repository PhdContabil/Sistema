"use client";

import { useEffect, useMemo, useState } from "react";
import { calcular, formatBRL, formatNum, formatPct, formatCNPJ } from "@/lib/dissidio-calculo";
import type { PerfilEmpresa, PerfilServico, PerfilAno, Rodada, Ajuste } from "@/lib/dissidio-tipos";

type Filtro = "todas" | "ajustadas" | "pendentes" | "sem_mensalidade";

export default function AnaliseDissidio({
  ano, anosDisponiveis, anosComparados, empresas, rodada, ajustesIniciais, meuEmail, erroServidor,
}: {
  ano: number;
  anosDisponiveis: number[];
  anosComparados: number[];
  empresas: PerfilEmpresa[];
  rodada: Rodada | null;
  ajustesIniciais: Ajuste[];
  meuEmail: string | null;
  erroServidor: string | null;
}) {
  const [ajustes, setAjustes] = useState<Map<number, Ajuste>>(
    () => new Map(ajustesIniciais.map((a) => [a.codigoempresa, a]))
  );
  const [percGeral, setPercGeral] = useState(String(rodada?.percentual_geral ?? 0));
  const [obsAno, setObsAno] = useState(rodada?.observacao ?? "");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  const percentualGeral = Number(String(percGeral).replace(",", ".")) || 0;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  async function patch(corpo: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dissidio/${ano}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
      return true;
    } catch {
      setErro("Falha de rede ao salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRodada(campos: Record<string, unknown>) {
    if (await patch({ alvo: "rodada", ...campos })) setAviso("Rodada salva.");
  }

  async function salvarEmpresa(
    cod: number,
    campos: { percentual?: string; valor_novo?: string; observacao?: string },
    base: number | null
  ) {
    const ok = await patch({ alvo: "empresa", codigoempresa: cod, valor_base: base, ...campos });
    if (!ok) return;

    const atual = ajustes.get(cod);
    const novo: Ajuste = {
      ano, codigoempresa: cod,
      percentual: atual?.percentual ?? null,
      valor_novo: atual?.valor_novo ?? null,
      valor_base: base,
      origem: atual?.origem ?? "percentual",
      observacao: atual?.observacao ?? null,
      analisado_por: meuEmail,
      analisado_em: new Date().toISOString(),
    };
    if (campos.percentual !== undefined) {
      novo.percentual = campos.percentual === "" ? null : Number(campos.percentual.replace(",", "."));
      novo.valor_novo = null;
      novo.origem = "percentual";
    }
    if (campos.valor_novo !== undefined) {
      novo.valor_novo = campos.valor_novo === "" ? null : Number(campos.valor_novo.replace(",", "."));
      novo.percentual = null;
      novo.origem = "valor";
    }
    if (campos.observacao !== undefined) novo.observacao = campos.observacao || null;

    const m = new Map(ajustes);
    m.set(cod, novo);
    setAjustes(m);
    setAviso("Salvo.");
  }

  async function limparEmpresa(cod: number) {
    if (!(await patch({ alvo: "empresa", codigoempresa: cod, limpar: true }))) return;
    const m = new Map(ajustes);
    m.delete(cod);
    setAjustes(m);
    setAviso("Voltou a seguir o percentual geral.");
  }

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return empresas
      .map((e) => {
        const aj = ajustes.get(e.codigoempresa);
        const base = e.mensalidade?.total ?? null;
        const calc = calcular(base, percentualGeral, aj);
        return { e, aj, base, calc };
      })
      .filter(({ e, aj, base }) => {
        if (filtro === "ajustadas" && !aj) return false;
        if (filtro === "pendentes" && aj) return false;
        if (filtro === "sem_mensalidade" && base) return false;
        if (!q) return true;
        return (
          (e.nome ?? "").toLowerCase().includes(q) ||
          String(e.codigoempresa).includes(q) ||
          String(e.codigocliente ?? "").includes(q) ||
          (e.cnpj ?? "").includes(q) ||
          (e.atividade?.descricao ?? "").toLowerCase().includes(q)
        );
      });
  }, [empresas, ajustes, percentualGeral, busca, filtro]);

  const totais = useMemo(() => {
    let atual = 0, novo = 0, comAjuste = 0, semMens = 0;
    for (const l of linhas) {
      if (l.base === null) { semMens++; continue; }
      atual += l.base;
      novo += l.calc.valorNovo ?? l.base;
      if (l.aj) comAjuste++;
    }
    return { atual, novo, diferenca: novo - atual, comAjuste, semMens };
  }, [linhas]);

  function exportar() {
    const cab = [
      "Cód. financeiro", "Cód. empresa", "Cód. estab.", "Empresa", "CNPJ", "Atividade", "Regime",
      "Qtd serviços", "Serviços contratados",
      ...anosComparados.flatMap((a) => [`Faturamento médio ${a}`, `Empregados médio ${a}`, `Horas médias ${a}`]),
      "Mensalidade atual", "Percentual", "Valor novo", "Diferença", "Individual",
      "Observação", "Analisado por", "Analisado em",
    ];
    const linhasCsv = linhas.map(({ e, aj, base, calc }) => [
      e.codigocliente ?? "", e.codigoempresa, e.codigoestab ?? "",
      e.nome ?? "", formatCNPJ(e.cnpj), e.atividade?.descricao ?? "", e.regime ?? "",
      e.mensalidade?.qtd_servicos ?? "",
      (e.servicos ?? []).map((s: PerfilServico) => s.descricao).filter(Boolean).join(" | "),
      ...anosComparados.flatMap((a) => {
        const y = e.anos?.find((x: PerfilAno) => x.ano === a);
        return [
          y?.faturamento_media_mes ?? "",
          y?.empregados_media_mes ?? "",
          y?.horas_media_mes ?? "",
        ];
      }),
      base ?? "", calc.percentual ?? "", calc.valorNovo ?? "", calc.diferenca ?? "",
      aj ? "Sim" : "Não", aj?.observacao ?? "", aj?.analisado_por ?? "",
      aj?.analisado_em ? new Date(aj.analisado_em).toLocaleString("pt-BR") : "",
    ]);

    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const meta = [
      "Análise de Dissídio — Núcleo Contábil",
      `Rodada;${ano}`,
      `Percentual geral;${percentualGeral}%`,
      `Anos comparados;${anosComparados.join(" / ")}`,
      `Empresas listadas;${linhas.length}`,
      `Mensalidade atual (soma);${totais.atual.toFixed(2)}`,
      `Mensalidade nova (soma);${totais.novo.toFixed(2)}`,
      `Diferença;${totais.diferenca.toFixed(2)}`,
      `Observação do ano;${(obsAno || "-").replace(/[\r\n;]+/g, " ")}`,
      `Extraído em;${new Date().toLocaleString("pt-BR")}`,
      "",
    ].join("\r\n");

    const corpo = [cab, ...linhasCsv].map((r) => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + meta + corpo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dissidio-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      {erro && <div className="banner error">{erro}</div>}

      <div className="rodada">
        <div className="rodada-linha">
          <label className="campo-inline">
            <span>Rodada</span>
            <select
              className="sel"
              value={ano}
              onChange={(e) => { window.location.href = `/m/financeiro/dissidio?ano=${e.target.value}`; }}
            >
              {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="campo-inline">
            <span>Percentual geral</span>
            <div className="com-sufixo">
              <input
                inputMode="decimal"
                value={percGeral}
                onChange={(e) => setPercGeral(e.target.value)}
                onBlur={() => salvarRodada({ percentual_geral: percGeral })}
                disabled={salvando}
              />
              <em>%</em>
            </div>
          </label>

          <span className="rodada-dica">
            Vale para todas as empresas. O ajuste individual sobrepõe.
          </span>

          <button className="btn" onClick={exportar}>↓ Excel</button>
        </div>

        <label className="campo-inline larga">
          <span>Observação do ano</span>
          <textarea
            rows={2}
            value={obsAno}
            onChange={(e) => setObsAno(e.target.value)}
            onBlur={() => salvarRodada({ observacao: obsAno })}
            placeholder="Ex.: convenção coletiva 2026, reajuste de 4,5% sobre a data-base de janeiro."
          />
        </label>
      </div>

      <div className="summary">
        <div className="card">
          <div className="k">Mensalidade atual</div>
          <div className="v num">R$ {formatBRL(totais.atual)}</div>
          <div className="sub">{linhas.length} empresas em tela</div>
        </div>
        <div className="card">
          <div className="k">Mensalidade nova</div>
          <div className="v num">R$ {formatBRL(totais.novo)}</div>
          <div className="sub">com os ajustes aplicados</div>
        </div>
        <div className="card div">
          <div className="k">Diferença</div>
          <div className="v num">R$ {formatBRL(totais.diferenca)}</div>
          <div className="sub">
            {totais.atual > 0 ? formatPct((totais.diferenca / totais.atual) * 100) : "—"} no total
          </div>
        </div>
        <div className="card">
          <div className="k">Ajuste individual</div>
          <div className="v num">{totais.comAjuste}</div>
          <div className="sub">empresas fora da regra geral</div>
        </div>
        {totais.semMens > 0 && (
          <div className="card">
            <div className="k">Sem mensalidade</div>
            <div className="v num">{totais.semMens}</div>
            <div className="sub">fora do cálculo</div>
          </div>
        )}
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar empresa, código, CNPJ ou atividade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className={`chip ${filtro === "todas" ? "on" : ""}`} onClick={() => setFiltro("todas")}>Todas</span>
        <span className={`chip ${filtro === "ajustadas" ? "on" : ""}`} onClick={() => setFiltro("ajustadas")}>Ajustadas</span>
        <span className={`chip ${filtro === "pendentes" ? "on" : ""}`} onClick={() => setFiltro("pendentes")}>Sem ajuste</span>
        <span className={`chip ${filtro === "sem_mensalidade" ? "on" : ""}`} onClick={() => setFiltro("sem_mensalidade")}>Sem mensalidade</span>
        <span className="contador">{linhas.length} de {empresas.length}</span>
      </div>

      <div className="table-wrap">
        <table className="grid dissidio">
          <thead>
            <tr>
              <th className="col-empresa" rowSpan={2}>Empresa</th>
              <th rowSpan={2}>Atividade</th>
              <th rowSpan={2}>Regime</th>
              <th rowSpan={2}>Serviços</th>
              {anosComparados.map((a) => (
                <th key={a} className="ano" colSpan={3}>{a}</th>
              ))}
              <th className="sim" colSpan={4}>Simulação {ano}</th>
            </tr>
            <tr>
              {anosComparados.map((a) => (
                <>
                  <th key={`${a}f`} className="ano num">Faturam./mês</th>
                  <th key={`${a}e`} className="ano num">Empreg.</th>
                  <th key={`${a}h`} className="ano num">Horas/mês</th>
                </>
              ))}
              <th className="sim num">Mensalidade</th>
              <th className="sim num">%</th>
              <th className="sim num">Valor novo</th>
              <th className="sim num">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ e, aj, base, calc }) => (
              <LinhaEmpresa
                key={e.codigoempresa}
                e={e} aj={aj} base={base} calc={calc}
                anos={anosComparados}
                salvando={salvando}
                aberta={aberta === e.codigoempresa}
                onAbrir={() => setAberta(aberta === e.codigoempresa ? null : e.codigoempresa)}
                onSalvar={(campos) => salvarEmpresa(e.codigoempresa, campos, base)}
                onLimpar={() => limparEmpresa(e.codigoempresa)}
              />
            ))}
            {linhas.length === 0 && (
              <tr><td className="loading" colSpan={8 + anosComparados.length * 3}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {aviso && <div className="toast">{aviso}</div>}

      <p className="footnote">
        Faturamento, empregados e horas são <strong>médias mensais de cada ano-calendário</strong>,
        lidas da API em tempo real. A mensalidade é o honorário vigente hoje. Clique na empresa para
        abrir a observação individual e ver quem analisou.
      </p>
    </>
  );
}

function LinhaEmpresa({
  e, aj, base, calc, anos, salvando, aberta, onAbrir, onSalvar, onLimpar,
}: {
  e: PerfilEmpresa;
  aj: Ajuste | undefined;
  base: number | null;
  calc: ReturnType<typeof calcular>;
  anos: number[];
  salvando: boolean;
  aberta: boolean;
  onAbrir: () => void;
  onSalvar: (campos: { percentual?: string; valor_novo?: string; observacao?: string }) => void;
  onLimpar: () => void;
}) {
  const [pct, setPct] = useState(aj?.percentual !== null && aj?.percentual !== undefined ? String(aj.percentual) : "");
  const [val, setVal] = useState(aj?.valor_novo !== null && aj?.valor_novo !== undefined ? String(aj.valor_novo) : "");
  const [obs, setObs] = useState(aj?.observacao ?? "");

  useEffect(() => {
    setPct(aj?.percentual !== null && aj?.percentual !== undefined ? String(aj.percentual) : "");
    setVal(aj?.valor_novo !== null && aj?.valor_novo !== undefined ? String(aj.valor_novo) : "");
    setObs(aj?.observacao ?? "");
  }, [aj]);

  return (
    <>
      <tr className={aj ? "tem-ajuste" : ""}>
        <td className="col-empresa">
          <button className="link-empresa" onClick={onAbrir}>
            {e.nome ?? `Empresa #${e.codigoempresa}`}
          </button>
          <span className="cnpj">
            <span className="codigo">fin. {e.codigocliente ?? "—"}</span>
            {" · "}emp. {e.codigoempresa}
            {e.codigoestab ? ` · estab. ${e.codigoestab}` : ""}
            {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
          </span>
          {aj && (
            <span className="obs obs-mov">
              ajuste individual · {aj.analisado_por ?? "—"}
            </span>
          )}
        </td>
        <td className="atividade">{e.atividade?.descricao ?? "—"}</td>
        <td className="regime">{e.regime ?? "—"}</td>
        <td className="num" title={(e.servicos ?? []).map((s: PerfilServico) => s.descricao).filter(Boolean).join("\n")}>
          {e.mensalidade?.qtd_servicos ?? "—"}
        </td>

        {anos.map((a) => {
          const y = e.anos?.find((x: PerfilAno) => x.ano === a);
          const parcial = y && y.meses_considerados < 12;
          return (
            <>
              <td key={`${a}f`} className="ano num" title={parcial ? `${y?.meses_considerados} meses` : undefined}>
                {y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—"}
                {parcial && <span className="parcial">*</span>}
              </td>
              <td key={`${a}e`} className="ano num">{formatNum(y?.empregados_media_mes ?? null)}</td>
              <td key={`${a}h`} className="ano num">{formatNum(y?.horas_media_mes ?? null)}</td>
            </>
          );
        })}

        <td className="sim num">{base === null ? "—" : formatBRL(base)}</td>
        <td className="sim">
          <input
            className="mini"
            inputMode="decimal"
            value={pct}
            disabled={salvando}
            placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
            onChange={(ev) => setPct(ev.target.value)}
            onBlur={() => {
              const atual = aj?.percentual !== null && aj?.percentual !== undefined ? String(aj.percentual) : "";
              if (pct !== atual) onSalvar({ percentual: pct });
            }}
          />
        </td>
        <td className="sim">
          <input
            className="mini"
            inputMode="decimal"
            value={val}
            disabled={salvando}
            placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
            onChange={(ev) => setVal(ev.target.value)}
            onBlur={() => {
              const atual = aj?.valor_novo !== null && aj?.valor_novo !== undefined ? String(aj.valor_novo) : "";
              if (val !== atual) onSalvar({ valor_novo: val });
            }}
          />
        </td>
        <td className={`sim num ${(calc.diferenca ?? 0) < 0 ? "res-div" : ""}`}>
          {calc.diferenca === null ? "—" : formatBRL(calc.diferenca)}
        </td>
      </tr>

      {aberta && (
        <tr className="detail-row">
          <td colSpan={8 + anos.length * 3}>
            <div className="detail-box">
              <div className="detail-title">{e.nome}</div>
              <div className="det-grid">
                <label className="campo-inline larga">
                  <span>Observação desta empresa</span>
                  <textarea
                    rows={2}
                    value={obs}
                    disabled={salvando}
                    onChange={(ev) => setObs(ev.target.value)}
                    onBlur={() => { if (obs !== (aj?.observacao ?? "")) onSalvar({ observacao: obs }); }}
                    placeholder="Ex.: cliente em negociação, reajuste escalonado."
                  />
                </label>
                <div className="det-info">
                  {aj ? (
                    <>
                      <div>
                        Analisado por <strong>{aj.analisado_por ?? "—"}</strong>
                        {aj.analisado_em && ` em ${new Date(aj.analisado_em).toLocaleString("pt-BR")}`}
                      </div>
                      {aj.valor_base !== null && (
                        <div className="detail-note">
                          Base congelada na decisão: R$ {formatBRL(aj.valor_base)}
                        </div>
                      )}
                      <button className="btn" onClick={onLimpar} disabled={salvando}>
                        Voltar ao percentual geral
                      </button>
                    </>
                  ) : (
                    <div className="detail-note">
                      Segue o percentual geral. Preencha % ou valor para criar uma exceção.
                    </div>
                  )}
                </div>
              </div>
              {(e.servicos ?? []).length > 0 && (
                <div className="detail-note" style={{ marginTop: 8 }}>
                  <strong>Serviços contratados:</strong>{" "}
                  {(e.servicos ?? []).map((s: PerfilServico) => s.descricao).filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
