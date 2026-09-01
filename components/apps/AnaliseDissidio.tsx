"use client";

import { useEffect, useMemo, useState } from "react";
import { calcular, formatBRL, formatNum, formatPct, formatCNPJ } from "@/lib/dissidio-calculo";
import type { PerfilEmpresa, PerfilServico, PerfilAno, Rodada, Ajuste } from "@/lib/dissidio-tipos";

type Situacao = "todas" | "ajustadas" | "pendentes" | "sem_mensalidade";
type Ordenar =
  | "nome" | "mensalidade" | "faturamento" | "empregados" | "horas" | "diferenca" | "percentual";

const POR_PAGINA = 50;

/** Métricas do ano mais recente da comparação. */
function anoDe(e: PerfilEmpresa, ano: number): PerfilAno | undefined {
  return e.anos?.find((x: PerfilAno) => x.ano === ano);
}

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
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [regime, setRegime] = useState("");
  const [atividade, setAtividade] = useState("");
  const [soAtivas, setSoAtivas] = useState(true);
  const [ordenar, setOrdenar] = useState<Ordenar>("nome");
  const [desc, setDesc] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  const percentualGeral = Number(String(percGeral).replace(",", ".")) || 0;
  const anoRecente = anosComparados[anosComparados.length - 1];

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  // Qualquer mudança de recorte volta para a primeira página.
  useEffect(() => { setPagina(1); }, [busca, situacao, regime, atividade, soAtivas, ordenar, desc]);

  const regimes = useMemo(
    () => [...new Set(empresas.map((e) => e.regime).filter(Boolean) as string[])].sort(),
    [empresas]
  );
  const atividades = useMemo(
    () => [...new Set(empresas.map((e) => e.atividade?.descricao).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [empresas]
  );

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
    if (!(await patch({ alvo: "empresa", codigoempresa: cod, valor_base: base, ...campos }))) return;

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

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = empresas
      .map((e) => {
        const aj = ajustes.get(e.codigoempresa);
        const base = e.mensalidade?.total ?? null;
        return { e, aj, base, calc: calcular(base, percentualGeral, aj) };
      })
      .filter(({ e, aj, base }) => {
        if (soAtivas && e.codigocliente_ativo === false) return false;
        if (regime && e.regime !== regime) return false;
        if (atividade && e.atividade?.descricao !== atividade) return false;
        if (situacao === "ajustadas" && !aj) return false;
        if (situacao === "pendentes" && aj) return false;
        if (situacao === "sem_mensalidade" && base) return false;
        if (!q) return true;
        return (
          (e.nome ?? "").toLowerCase().includes(q) ||
          String(e.codigoempresa).includes(q) ||
          String(e.codigocliente ?? "").includes(q) ||
          (e.cnpj ?? "").includes(q) ||
          (e.atividade?.descricao ?? "").toLowerCase().includes(q)
        );
      });

    const chave = (l: (typeof lista)[number]): number | string => {
      const y = anoDe(l.e, anoRecente);
      switch (ordenar) {
        case "mensalidade": return l.base ?? -1;
        case "faturamento": return y?.faturamento_media_mes ?? -1;
        case "empregados": return y?.empregados_media_mes ?? -1;
        case "horas": return y?.horas_media_mes ?? -1;
        case "diferenca": return l.calc.diferenca ?? -Infinity;
        case "percentual": return l.calc.percentual ?? -Infinity;
        default: return (l.e.nome ?? "").toLowerCase();
      }
    };

    lista.sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      const r = typeof ka === "string" && typeof kb === "string"
        ? ka.localeCompare(kb, "pt-BR")
        : Number(ka) - Number(kb);
      return desc ? -r : r;
    });

    return lista;
  }, [empresas, ajustes, percentualGeral, busca, situacao, regime, atividade, soAtivas, ordenar, desc, anoRecente]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // Totais consideram TUDO que passou no filtro, não só a página — senão a
  // simulação mudaria de valor a cada vez que você virasse a página.
  const totais = useMemo(() => {
    let atual = 0, novo = 0, comAjuste = 0, semMens = 0;
    for (const l of filtradas) {
      if (l.base === null) { semMens++; continue; }
      atual += l.base;
      novo += l.calc.valorNovo ?? l.base;
      if (l.aj) comAjuste++;
    }
    return { atual, novo, diferenca: novo - atual, comAjuste, semMens };
  }, [filtradas]);

  function ordenarPor(col: Ordenar) {
    if (ordenar === col) setDesc(!desc);
    else { setOrdenar(col); setDesc(col !== "nome"); }
  }
  const seta = (col: Ordenar) => (ordenar === col ? (desc ? " ↓" : " ↑") : "");

  function exportar() {
    const cab = [
      "Cód. financeiro", "Cód. empresa", "Cód. estab.", "Empresa", "CNPJ", "Atividade", "Regime", "Ativa",
      "Qtd serviços",
      ...anosComparados.flatMap((a) => [
        `Faturamento médio ${a}`, `Empregados médio ${a}`, `Horas médias ${a}`, `Mensalidade ${a}`,
      ]),
      "Mensalidade atual", "Percentual", "Valor novo", "Diferença", "Individual",
      "Valor base da decisão", "Observação", "Analisado por", "Analisado em",
    ];
    const linhasCsv = filtradas.map(({ e, aj, base, calc }) => [
      e.codigocliente ?? "", e.codigoempresa, e.codigoestab ?? "",
      e.nome ?? "", formatCNPJ(e.cnpj), e.atividade?.descricao ?? "", e.regime ?? "",
      e.codigocliente_ativo === false ? "Não" : "Sim",
      e.mensalidade?.qtd_servicos ?? "",
      ...anosComparados.flatMap((a) => {
        const y = anoDe(e, a);
        return [
          y?.faturamento_media_mes ?? "", y?.empregados_media_mes ?? "",
          y?.horas_media_mes ?? "", y?.mensalidade_total ?? "",
        ];
      }),
      base ?? "", calc.percentual ?? "", calc.valorNovo ?? "", calc.diferenca ?? "",
      aj ? "Sim" : "Não", aj?.valor_base ?? "", aj?.observacao ?? "", aj?.analisado_por ?? "",
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
      `Filtros;${soAtivas ? "só ativas" : "todas"}${regime ? ` | regime: ${regime}` : ""}${atividade ? ` | atividade: ${atividade}` : ""}`,
      `Empresas listadas;${filtradas.length}`,
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

  const colunas = 9 + anosComparados.length * 4;

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

          <a className="btn" href="/m/financeiro/dissidio/historico">Histórico</a>
          <button className="btn" onClick={exportar}>↓ Excel</button>
        </div>

        {ano < new Date().getFullYear() && (
          <div className="banner" style={{ marginTop: 4 }}>
            Rodada de ano anterior. As colunas de <strong>mensalidade atual</strong> mostram o
            honorário vigente <strong>hoje</strong>, não o da época — a API só informa o valor
            corrente. O valor que valeu na decisão está em <strong>Detalhes</strong> de cada
            empresa ajustada e no <a href="/m/financeiro/dissidio/historico">Histórico</a>.
          </div>
        )}

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
          <div className="sub">{filtradas.length} empresas no filtro</div>
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
        <select className="sel" value={regime} onChange={(e) => setRegime(e.target.value)}>
          <option value="">Todo regime</option>
          {regimes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="sel wide" value={atividade} onChange={(e) => setAtividade(e.target.value)}>
          <option value="">Toda atividade</option>
          {atividades.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className={`chip ${soAtivas ? "on" : ""}`} onClick={() => setSoAtivas((v) => !v)}>
          Só ativas
        </span>
        <span className={`chip ${situacao === "todas" ? "on" : ""}`} onClick={() => setSituacao("todas")}>Todas</span>
        <span className={`chip ${situacao === "ajustadas" ? "on" : ""}`} onClick={() => setSituacao("ajustadas")}>Ajustadas</span>
        <span className={`chip ${situacao === "pendentes" ? "on" : ""}`} onClick={() => setSituacao("pendentes")}>Sem ajuste</span>
        <span className={`chip ${situacao === "sem_mensalidade" ? "on" : ""}`} onClick={() => setSituacao("sem_mensalidade")}>Sem mensalidade</span>
        <span className="contador">{filtradas.length} de {empresas.length}</span>
      </div>

      <div className="table-wrap">
        <table className="grid dissidio">
          <thead>
            <tr>
              <th className="col-empresa" rowSpan={2}>
                <button className="th-ord" onClick={() => ordenarPor("nome")}>Empresa{seta("nome")}</button>
              </th>
              <th rowSpan={2}>Atividade</th>
              <th rowSpan={2}>Regime</th>
              {anosComparados.map((a) => (
                <th key={a} className="ano" colSpan={4}>{a}</th>
              ))}
              <th className="sim" colSpan={4}>Simulação {ano}</th>
            </tr>
            <tr>
              {anosComparados.map((a) => {
                const ult = a === anoRecente;
                return [
                  <th key={`${a}f`} className="ano num">
                    {ult ? <button className="th-ord" onClick={() => ordenarPor("faturamento")}>Faturam./mês{seta("faturamento")}</button> : "Faturam./mês"}
                  </th>,
                  <th key={`${a}e`} className="ano num">
                    {ult ? <button className="th-ord" onClick={() => ordenarPor("empregados")}>Empreg.{seta("empregados")}</button> : "Empreg."}
                  </th>,
                  <th key={`${a}h`} className="ano num">
                    {ult ? <button className="th-ord" onClick={() => ordenarPor("horas")}>Horas/mês{seta("horas")}</button> : "Horas/mês"}
                  </th>,
                  <th key={`${a}m`} className="ano num">Mensalid.</th>,
                ];
              })}
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("mensalidade")}>Atual{seta("mensalidade")}</button>
              </th>
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("percentual")}>%{seta("percentual")}</button>
              </th>
              <th className="sim num">Valor novo</th>
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("diferenca")}>Dif.{seta("diferenca")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ e, aj, base, calc }) => (
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
            {visiveis.length === 0 && (
              <tr><td className="loading" colSpan={colunas}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="paginacao">
          <button className="btn" onClick={() => setPagina(1)} disabled={paginaAtual === 1}>« Primeira</button>
          <button className="btn" onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 1}>‹ Anterior</button>
          <span className="pag-info">
            Página <strong>{paginaAtual}</strong> de {totalPaginas} ·{" "}
            {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, filtradas.length)} de {filtradas.length}
          </span>
          <button className="btn" onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual === totalPaginas}>Próxima ›</button>
          <button className="btn" onClick={() => setPagina(totalPaginas)} disabled={paginaAtual === totalPaginas}>Última »</button>
        </div>
      )}

      {aviso && <div className="toast">{aviso}</div>}

      <p className="footnote">
        Faturamento, empregados e horas são <strong>médias mensais de cada ano-calendário</strong>;
        a mensalidade de cada ano é o honorário vigente em 31/12 daquele ano. O asterisco marca ano
        ainda incompleto. Os totais somam todas as empresas do filtro, não só a página.
        Use <strong>Detalhes</strong> na linha para a observação individual e os serviços contratados.
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
  const [pct, setPct] = useState(aj?.percentual != null ? String(aj.percentual) : "");
  const [val, setVal] = useState(aj?.valor_novo != null ? String(aj.valor_novo) : "");
  const [obs, setObs] = useState(aj?.observacao ?? "");
  const [servicos, setServicos] = useState<PerfilServico[] | null>(null);
  const [buscandoServicos, setBuscandoServicos] = useState(false);

  useEffect(() => {
    setPct(aj?.percentual != null ? String(aj.percentual) : "");
    setVal(aj?.valor_novo != null ? String(aj.valor_novo) : "");
    setObs(aj?.observacao ?? "");
  }, [aj]);

  // Serviços só são buscados quando a linha abre — e uma vez só.
  useEffect(() => {
    if (!aberta || servicos !== null || buscandoServicos) return;
    setBuscandoServicos(true);
    fetch(`/api/dissidio/empresa/${e.codigoempresa}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setServicos(j.servicos ?? []))
      .catch(() => setServicos([]))
      .finally(() => setBuscandoServicos(false));
  }, [aberta, servicos, buscandoServicos, e.codigoempresa]);

  return (
    <>
      <tr className={aj ? "tem-ajuste" : ""}>
        <td className="col-empresa">
          <span className="emp-nome">
            {e.nome ?? `Empresa #${e.codigoempresa}`}
            {e.codigocliente_ativo === false && <span className="tag-inativa">inativa</span>}
          </span>
          <span className="cnpj">
            <span className="codigo">fin. {e.codigocliente ?? "—"}</span>
            {" · "}emp. {e.codigoempresa}
            {e.codigoestab ? ` · estab. ${e.codigoestab}` : ""}
            {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
          </span>
          <button className="btn-detalhes" onClick={onAbrir} aria-haspopup="dialog">
            Abrir detalhes
            {aj && <span className="ponto-ajuste" title="tem ajuste individual" />}
          </button>
        </td>
        <td className="atividade" title={e.atividade?.descricao ?? ""}>{e.atividade?.descricao ?? "—"}</td>
        <td className="regime">{e.regime ?? "—"}</td>

        {anos.map((a) => {
          const y = anoDe(e, a);
          const parcial = y && y.meses_considerados < 12;
          return [
            <td key={`${a}f`} className="ano num" title={parcial ? `${y?.meses_considerados} meses fechados` : undefined}>
              {y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—"}
              {parcial && <span className="parcial">*</span>}
            </td>,
            <td key={`${a}e`} className="ano num">{formatNum(y?.empregados_media_mes ?? null)}</td>,
            <td key={`${a}h`} className="ano num">{formatNum(y?.horas_media_mes ?? null)}</td>,
            <td key={`${a}m`} className="ano num">{y?.mensalidade_total ? formatBRL(y.mensalidade_total) : "—"}</td>,
          ];
        })}

        <td className="sim num">{base === null ? "—" : formatBRL(base)}</td>
        <td className="sim">
          <input
            className="mini" inputMode="decimal" value={pct} disabled={salvando}
            placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
            onChange={(ev) => setPct(ev.target.value)}
            onBlur={() => {
              const atual = aj?.percentual != null ? String(aj.percentual) : "";
              if (pct !== atual) onSalvar({ percentual: pct });
            }}
          />
        </td>
        <td className="sim">
          <input
            className="mini" inputMode="decimal" value={val} disabled={salvando}
            placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
            onChange={(ev) => setVal(ev.target.value)}
            onBlur={() => {
              const atual = aj?.valor_novo != null ? String(aj.valor_novo) : "";
              if (val !== atual) onSalvar({ valor_novo: val });
            }}
          />
        </td>
        <td className={`sim num ${(calc.diferenca ?? 0) < 0 ? "res-div" : ""}`}>
          {calc.diferenca === null ? "—" : formatBRL(calc.diferenca)}
        </td>
      </tr>

      {aberta && (
        <div className="modal-bg" onClick={onAbrir}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="tk-crumbs">
                  fin. {e.codigocliente ?? "—"} · emp. {e.codigoempresa}
                  {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
                </div>
                <h2>{e.nome ?? `Empresa #${e.codigoempresa}`}</h2>
              </div>
              <button className="btn icon" onClick={onAbrir} aria-label="Fechar">✕</button>
            </div>

            <div className="modal-body">
              <div className="medicao">
                <div className="med">
                  <div className="k">Mensalidade atual</div>
                  <div className="v">{base === null ? "—" : `R$ ${formatBRL(base)}`}</div>
                </div>
                <div className="med">
                  <div className="k">Percentual</div>
                  <div className="v">{formatPct(calc.percentual)}</div>
                  <div className="ajuda">{calc.individual ? "ajuste desta empresa" : "percentual geral da rodada"}</div>
                </div>
                <div className="med destaque">
                  <div className="k">Valor novo</div>
                  <div className="v">{calc.valorNovo === null ? "—" : `R$ ${formatBRL(calc.valorNovo)}`}</div>
                  <div className="ajuda">
                    {calc.diferenca === null ? "" : `diferença de R$ ${formatBRL(calc.diferenca)}`}
                  </div>
                </div>
              </div>

              <h3>Ajuste desta empresa</h3>
              <div className="form-linha">
                <label className="campo-inline">
                  <span>Percentual (%)</span>
                  <input
                    inputMode="decimal" value={pct} disabled={salvando}
                    placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
                    onChange={(ev) => setPct(ev.target.value)}
                    onBlur={() => {
                      const atual = aj?.percentual != null ? String(aj.percentual) : "";
                      if (pct !== atual) onSalvar({ percentual: pct });
                    }}
                  />
                </label>
                <label className="campo-inline">
                  <span>ou valor novo (R$)</span>
                  <input
                    inputMode="decimal" value={val} disabled={salvando}
                    placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
                    onChange={(ev) => setVal(ev.target.value)}
                    onBlur={() => {
                      const atual = aj?.valor_novo != null ? String(aj.valor_novo) : "";
                      if (val !== atual) onSalvar({ valor_novo: val });
                    }}
                  />
                </label>
              </div>
              <p className="nota">
                Preencha um dos dois — o outro é calculado. Em branco, a empresa segue o percentual geral.
              </p>

              <h3>Observação desta empresa</h3>
              <textarea
                rows={3} value={obs} disabled={salvando} style={{ width: "100%" }}
                onChange={(ev) => setObs(ev.target.value)}
                onBlur={() => { if (obs !== (aj?.observacao ?? "")) onSalvar({ observacao: obs }); }}
                placeholder="Ex.: cliente em negociação, reajuste escalonado a partir de julho."
              />

              {aj && (
                <p className="nota" style={{ marginTop: 10 }}>
                  Analisado por <strong>{aj.analisado_por ?? "—"}</strong>
                  {aj.analisado_em && ` em ${new Date(aj.analisado_em).toLocaleString("pt-BR")}`}.
                  {aj.valor_base !== null && <> Base congelada na decisão: R$ {formatBRL(aj.valor_base)}.</>}
                </p>
              )}

              <h3>Perfil por ano</h3>
              <div className="table-wrap">
                <table className="grid mini-perfil">
                  <thead>
                    <tr>
                      <th>Ano</th>
                      <th className="num">Faturam./mês</th>
                      <th className="num">Empregados</th>
                      <th className="num">Horas/mês</th>
                      <th className="num">Mensalidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anos.map((a) => {
                      const y = anoDe(e, a);
                      const parcial = y && y.meses_considerados < 12;
                      return (
                        <tr key={a}>
                          <td>
                            {a}
                            {parcial && <span className="parcial" title={`${y?.meses_considerados} meses fechados`}>*</span>}
                          </td>
                          <td className="num">{y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—"}</td>
                          <td className="num">{formatNum(y?.empregados_media_mes ?? null)}</td>
                          <td className="num">{formatNum(y?.horas_media_mes ?? null)}</td>
                          <td className="num">{y?.mensalidade_total ? formatBRL(y.mensalidade_total) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3>Serviços contratados</h3>
              {buscandoServicos && <p className="nota">Carregando…</p>}
              {servicos !== null && servicos.length === 0 && <p className="nota">Nenhum serviço vigente.</p>}
              {servicos !== null && servicos.length > 0 && (
                <div className="servicos-lista">
                  {servicos.map((s) => (
                    <span key={s.servico} className="servico-item">
                      {s.descricao ?? `#${s.servico}`}
                      {s.valor ? <em> R$ {formatBRL(s.valor)}</em> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-foot">
              {aj && (
                <button className="btn" onClick={onLimpar} disabled={salvando}>
                  Voltar ao percentual geral
                </button>
              )}{" "}
              <button className="btn primary" onClick={onAbrir}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
