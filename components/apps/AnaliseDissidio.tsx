"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calcular, formatBRL, formatNum, formatPct, formatCNPJ } from "@/lib/dissidio-calculo";
import {
  RESPONSAVEIS, RESPONSAVEL_NOME,
  type PerfilEmpresa, type PerfilServico, type PerfilAno,
  type Rodada, type Ajuste, type MarcadorEmpresa,
} from "@/lib/dissidio-tipos";

type Situacao = "todas" | "ajustadas" | "pendentes" | "sem_mensalidade";
type Ordenar =
  | "nome" | "mensalidade" | "faturamento" | "empregados" | "horas" | "diferenca" | "percentual";

const POR_PAGINA = 50;

function anoDe(e: PerfilEmpresa, ano: number): PerfilAno | undefined {
  return e.anos?.find((x: PerfilAno) => x.ano === ano);
}


/**
 * Mensalidade a exibir no bloco de um ano.
 *
 * Para anos fechados vale o honorário vigente em 31/12 daquele ano, como a API
 * entrega. Para o ANO CORRENTE a referência certa é o contrato de hoje — é ele
 * que serve de base para o reajuste, e é o mesmo número da coluna "Atual".
 */
function mensalidadeDoAno(e: PerfilEmpresa, ano: number): number | null {
  if (ano === new Date().getFullYear()) return e.mensalidade?.total ?? null;
  return anoDe(e, ano)?.mensalidade_total ?? null;
}

/** Estado editável de uma empresa na tela (rascunho, ainda não gravado). */
interface Rascunho {
  percentual: string;
  valor_novo: string;
  observacao: string;
  blacklist: boolean;
  blacklist_motivo: string;
  responsavel: string;
  /** `analisado_em` que veio do servidor — usado para detectar edição simultânea. */
  visto_em: string | null;
}

function rascunhoDe(aj: Ajuste | undefined, mk: MarcadorEmpresa | undefined): Rascunho {
  return {
    percentual: aj?.percentual != null ? String(aj.percentual) : "",
    valor_novo: aj?.valor_novo != null ? String(aj.valor_novo) : "",
    observacao: aj?.observacao ?? "",
    blacklist: mk?.blacklist ?? false,
    blacklist_motivo: mk?.blacklist_motivo ?? "",
    responsavel: mk?.responsavel ?? "",
    visto_em: aj?.analisado_em ?? null,
  };
}

export default function AnaliseDissidio({
  ano, anosDisponiveis, anosComparados, empresas, rodada,
  ajustesIniciais, marcadoresIniciais, meuEmail, erroServidor,
}: {
  ano: number;
  anosDisponiveis: number[];
  anosComparados: number[];
  empresas: PerfilEmpresa[];
  rodada: Rodada | null;
  ajustesIniciais: Ajuste[];
  marcadoresIniciais: MarcadorEmpresa[];
  meuEmail: string | null;
  erroServidor: string | null;
}) {
  const router = useRouter();

  const ajustes = useMemo(
    () => new Map(ajustesIniciais.map((a) => [a.codigoempresa, a])),
    [ajustesIniciais]
  );
  const marcadores = useMemo(
    () => new Map(marcadoresIniciais.map((m) => [m.codigoempresa, m])),
    [marcadoresIniciais]
  );

  // Rascunho: só entra aqui a empresa que a pessoa realmente mexeu.
  // É essa lista que vai para o servidor ao salvar — nunca a tela inteira.
  const [rascunhos, setRascunhos] = useState<Map<number, Rascunho>>(new Map());

  const [percGeral, setPercGeral] = useState(String(rodada?.percentual_geral ?? 0));
  const [obsAno, setObsAno] = useState(rodada?.observacao ?? "");
  const cabecalhoMudou =
    String(rodada?.percentual_geral ?? 0) !== percGeral || (rodada?.observacao ?? "") !== obsAno;

  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [regimes, setRegimes] = useState<string[]>([]);
  const [atividadesSel, setAtividadesSel] = useState<string[]>([]);
  const [responsaveisSel, setResponsaveisSel] = useState<string[]>([]);
  const [soBlacklist, setSoBlacklist] = useState(false);
  const [soAtivas, setSoAtivas] = useState(true);
  const [ordenar, setOrdenar] = useState<Ordenar>("nome");
  const [desc, setDesc] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [conflitos, setConflitos] = useState<{ codigoempresa: number; por: string | null; em: string }[]>([]);

  const percentualGeral = Number(String(percGeral).replace(",", ".")) || 0;
  const anoRecente = anosComparados[anosComparados.length - 1];
  const pendentes = rascunhos.size;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => { setPagina(1); }, [busca, situacao, regimes, atividadesSel, responsaveisSel, soBlacklist, soAtivas, ordenar, desc]);

  // Avisa antes de sair com alterações não salvas — o salvamento agora é manual.
  useEffect(() => {
    if (pendentes === 0 && !cabecalhoMudou) return;
    const aviso = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [pendentes, cabecalhoMudou]);

  const editar = useCallback((cod: number, campos: Partial<Rascunho>) => {
    setRascunhos((antes) => {
      const m = new Map(antes);
      const atual = m.get(cod) ?? rascunhoDe(ajustes.get(cod), marcadores.get(cod));
      m.set(cod, { ...atual, ...campos });
      return m;
    });
  }, [ajustes, marcadores]);

  const estadoDe = useCallback(
    (cod: number): Rascunho =>
      rascunhos.get(cod) ?? rascunhoDe(ajustes.get(cod), marcadores.get(cod)),
    [rascunhos, ajustes, marcadores]
  );

  const listaRegimes = useMemo(
    () => [...new Set(empresas.map((e) => e.regime).filter(Boolean) as string[])].sort(),
    [empresas]
  );
  const listaAtividades = useMemo(
    () => [...new Set(empresas.map((e) => e.atividade?.descricao).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [empresas]
  );

  async function salvarVersao() {
    setSalvando(true);
    setErro(null);
    setConflitos([]);
    try {
      const linhas = [...rascunhos.entries()].map(([cod, r]) => ({
        codigoempresa: cod,
        percentual: r.percentual,
        valor_novo: r.valor_novo,
        valor_base: empresas.find((e) => e.codigoempresa === cod)?.mensalidade?.total ?? null,
        observacao: r.observacao,
        blacklist: r.blacklist,
        blacklist_motivo: r.blacklist_motivo || null,
        responsavel: r.responsavel || null,
        visto_em: r.visto_em,
      }));

      const resp = await fetch(`/api/dissidio/${ano}/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          percentual_geral: percGeral,
          observacao: obsAno,
          empresas: linhas,
        }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { setErro(j.error ?? "Não foi possível salvar."); return; }

      setConfirmar(false);
      setRascunhos(new Map());
      if (Array.isArray(j.conflitos) && j.conflitos.length > 0) setConflitos(j.conflitos);
      setAviso(`Versão salva — ${j.gravadas ?? 0} empresa(s) gravada(s).`);
      router.refresh();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = empresas
      .map((e) => {
        const st = estadoDe(e.codigoempresa);
        const base = e.mensalidade?.total ?? null;
        const aj = ajustes.get(e.codigoempresa);
        // O cálculo usa o RASCUNHO, para a simulação refletir o que está na tela.
        const virtual: Ajuste | undefined =
          st.percentual !== "" || st.valor_novo !== ""
            ? {
                ano, codigoempresa: e.codigoempresa,
                percentual: st.percentual === "" ? null : Number(st.percentual.replace(",", ".")),
                valor_novo: st.valor_novo === "" ? null : Number(st.valor_novo.replace(",", ".")),
                valor_base: base,
                origem: st.valor_novo !== "" ? "valor" : "percentual",
                observacao: st.observacao || null,
                analisado_por: aj?.analisado_por ?? meuEmail,
                analisado_em: aj?.analisado_em ?? "",
              }
            : undefined;
        return {
          e, st, base, aj: virtual,
          gravado: aj,
          sujo: rascunhos.has(e.codigoempresa),
          calc: calcular(base, percentualGeral, virtual),
        };
      })
      .filter(({ e, st, aj, base }) => {
        if (soAtivas && e.codigocliente_ativo === false) return false;
        if (soBlacklist && !st.blacklist) return false;
        if (regimes.length > 0 && !regimes.includes(e.regime ?? "")) return false;
        if (atividadesSel.length > 0 && !atividadesSel.includes(e.atividade?.descricao ?? "")) return false;
        if (responsaveisSel.length > 0 && !responsaveisSel.includes(st.responsavel)) return false;
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
  }, [empresas, estadoDe, rascunhos, ajustes, percentualGeral, busca, situacao, regimes,
      atividadesSel, responsaveisSel, soBlacklist, soAtivas, ordenar, desc, anoRecente, ano, meuEmail]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const totais = useMemo(() => {
    let atual = 0, novo = 0, comAjuste = 0, semMens = 0, black = 0;
    for (const l of filtradas) {
      if (l.st.blacklist) black++;
      if (l.base === null) { semMens++; continue; }
      atual += l.base;
      novo += l.calc.valorNovo ?? l.base;
      if (l.aj) comAjuste++;
    }
    return { atual, novo, diferenca: novo - atual, comAjuste, semMens, black };
  }, [filtradas]);

  function ordenarPor(col: Ordenar) {
    if (ordenar === col) setDesc(!desc);
    else { setOrdenar(col); setDesc(col !== "nome"); }
  }
  const seta = (col: Ordenar) => (ordenar === col ? (desc ? " ↓" : " ↑") : "");

  function exportar() {
    const cab = [
      "Cód. financeiro", "Cód. empresa", "Cód. estab.", "Empresa", "CNPJ", "Atividade", "Regime", "Ativa",
      "Blacklist", "Motivo blacklist", "Responsável validação", "Qtd serviços",
      ...anosComparados.flatMap((a) => [
        `Faturamento médio ${a}`, `Empregados médio ${a}`, `Horas médias ${a}`, `Mensalidade ${a}`,
      ]),
      "Mensalidade atual", "Percentual", "Valor novo", "Diferença", "Individual",
      "Valor base da decisão", "Observação", "Analisado por", "Analisado em",
    ];
    const linhasCsv = filtradas.map(({ e, st, gravado, base, calc }) => [
      e.codigocliente ?? "", e.codigoempresa, e.codigoestab ?? "",
      e.nome ?? "", formatCNPJ(e.cnpj), e.atividade?.descricao ?? "", e.regime ?? "",
      e.codigocliente_ativo === false ? "Não" : "Sim",
      st.blacklist ? "Sim" : "Não", st.blacklist_motivo,
      RESPONSAVEL_NOME[st.responsavel] ?? "", e.mensalidade?.qtd_servicos ?? "",
      ...anosComparados.flatMap((a) => {
        const y = anoDe(e, a);
        return [
          y?.faturamento_media_mes ?? "", y?.empregados_media_mes ?? "",
          y?.horas_media_mes ?? "", mensalidadeDoAno(e, a) ?? "",
        ];
      }),
      base ?? "", calc.percentual ?? "", calc.valorNovo ?? "", calc.diferenca ?? "",
      calc.individual ? "Sim" : "Não", gravado?.valor_base ?? "", st.observacao,
      gravado?.analisado_por ?? "",
      gravado?.analisado_em ? new Date(gravado.analisado_em).toLocaleString("pt-BR") : "",
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

  const colunas = 11 + anosComparados.length * 4;
  const temPendencia = pendentes > 0 || cabecalhoMudou;

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      {erro && <div className="banner error">{erro}</div>}

      {conflitos.length > 0 && (
        <div className="banner">
          <strong>{conflitos.length} empresa(s)</strong> tinham sido alteradas por outra pessoa depois
          que você abriu a tela — o seu valor prevaleceu. Confira:{" "}
          {conflitos.map((c) => `#${c.codigoempresa} (${c.por ?? "?"})`).join(", ")}.
          <button className="btn" style={{ marginLeft: 8 }} onClick={() => setConflitos([])}>Ok</button>
        </div>
      )}

      <div className="rodada">
        <div className="rodada-linha">
          <label className="campo-inline">
            <span>Rodada</span>
            <select
              className="sel"
              value={ano}
              onChange={(e) => {
                if (temPendencia && !confirm("Há alterações não salvas. Trocar de ano vai descartá-las. Continuar?")) return;
                window.location.href = `/m/financeiro/dissidio?ano=${e.target.value}`;
              }}
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
                disabled={salvando}
              />
              <em>%</em>
            </div>
          </label>

          <button
            className="btn primary"
            onClick={() => setConfirmar(true)}
            disabled={salvando || !temPendencia}
          >
            {salvando ? "Salvando…" : temPendencia ? `Salvar versão (${pendentes})` : "Tudo salvo"}
          </button>

          <a className="btn" href="/m/financeiro/dissidio/historico">Histórico</a>
          <button className="btn" onClick={exportar}>↓ Excel</button>
        </div>

        <label className="campo-inline larga">
          <span>Observação do ano</span>
          <textarea
            rows={2}
            value={obsAno}
            onChange={(e) => setObsAno(e.target.value)}
            placeholder="Ex.: convenção coletiva 2026, reajuste de 4,5% sobre a data-base de janeiro."
          />
        </label>

        {temPendencia && (
          <p className="nota" style={{ marginTop: 6 }}>
            Alterações ficam só na sua tela até você clicar em <strong>Salvar versão</strong>.
            São gravadas apenas as empresas que você mexeu — quem estiver trabalhando em outras
            empresas ao mesmo tempo não é sobrescrito.
          </p>
        )}
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
          <div className="sub">simulação em tela</div>
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
          <div className="sub">fora da regra geral</div>
        </div>
        <div className="card">
          <div className="k">Blacklist</div>
          <div className="v num">{totais.black}</div>
          <div className="sub">clientes marcados</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar empresa, código, CNPJ ou atividade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <CaixaSelecao rotulo="Regime" opcoes={listaRegimes.map((r) => ({ id: r, nome: r }))}
                      selecionados={regimes} onMudar={setRegimes} />
        <CaixaSelecao rotulo="Atividade" opcoes={listaAtividades.map((a) => ({ id: a, nome: a }))}
                      selecionados={atividadesSel} onMudar={setAtividadesSel} larga />
        <CaixaSelecao rotulo="Responsável" opcoes={RESPONSAVEIS.map((r) => ({ id: r.id, nome: r.nome }))}
                      selecionados={responsaveisSel} onMudar={setResponsaveisSel} />
        <span className={`chip ${soBlacklist ? "on" : ""}`} onClick={() => setSoBlacklist((v) => !v)}>Blacklist</span>
        <span className={`chip ${soAtivas ? "on" : ""}`} onClick={() => setSoAtivas((v) => !v)}>Só ativas</span>
        <span className={`chip ${situacao === "todas" ? "on" : ""}`} onClick={() => setSituacao("todas")}>Todas</span>
        <span className={`chip ${situacao === "ajustadas" ? "on" : ""}`} onClick={() => setSituacao("ajustadas")}>Ajustadas</span>
        <span className={`chip ${situacao === "pendentes" ? "on" : ""}`} onClick={() => setSituacao("pendentes")}>Sem ajuste</span>
        <span className="contador">{filtradas.length} de {empresas.length}</span>
      </div>

      <TabelaComRolagemNoTopo>
        <table className="grid dissidio">
          <thead>
            <tr>
              <th className="col-empresa" rowSpan={2}>
                <button className="th-ord" onClick={() => ordenarPor("nome")}>Empresa{seta("nome")}</button>
              </th>
              <th rowSpan={2}>Atividade</th>
              <th rowSpan={2}>Regime</th>
              <th rowSpan={2}>Responsável</th>
              <th rowSpan={2}>Black</th>
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
                  <th key={`${a}m`} className="ano num">
                    {ult ? <button className="th-ord" onClick={() => ordenarPor("mensalidade")}>Mensalid.{seta("mensalidade")}</button> : "Mensalid."}
                  </th>,
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
            {visiveis.map(({ e, st, base, calc, sujo, gravado }) => (
              <LinhaEmpresa
                key={e.codigoempresa}
                e={e} st={st} base={base} calc={calc} sujo={sujo}
                anos={anosComparados}
                salvando={salvando}
                onAbrir={() => setAberta(e.codigoempresa)}
                onEditar={(campos) => editar(e.codigoempresa, campos)}
              />
            ))}
            {visiveis.length === 0 && (
              <tr><td className="loading" colSpan={colunas}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </TabelaComRolagemNoTopo>

      {aberta !== null && (() => {
        const alvo = filtradas.find((l) => l.e.codigoempresa === aberta);
        if (!alvo) return null;
        return (
          <ModalEmpresa
            e={alvo.e} st={alvo.st} base={alvo.base} calc={alvo.calc} gravado={alvo.gravado}
            anos={anosComparados} salvando={salvando}
            onFechar={() => setAberta(null)}
            onEditar={(campos) => editar(alvo.e.codigoempresa, campos)}
          />
        );
      })()}

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

      {confirmar && (
        <div className="modal-bg" onClick={() => setConfirmar(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-head">
              <h2>Salvar versão de {ano}</h2>
              <button className="btn icon" onClick={() => setConfirmar(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              <p>
                Serão gravadas <strong>{pendentes} empresa(s)</strong> que você alterou
                {cabecalhoMudou && <>, mais o <strong>percentual geral</strong> e a observação do ano</>}.
              </p>
              <p className="nota">
                Empresas que você não tocou ficam como estão — se outra pessoa estiver ajustando
                outras empresas agora, o trabalho dela não é sobrescrito. Se alguém tiver alterado
                alguma das suas empresas depois de você abrir a tela, o seu valor prevalece e eu aviso
                quais foram.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmar(false)} disabled={salvando}>Cancelar</button>{" "}
              <button className="btn primary" onClick={salvarVersao} disabled={salvando}>
                {salvando ? "Salvando…" : "Confirmar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && <div className="toast">{aviso}</div>}

      <p className="footnote">
        Faturamento, empregados e horas são <strong>médias mensais de cada ano-calendário</strong>;
        a mensalidade de cada ano é o honorário vigente em 31/12 daquele ano. O asterisco marca ano
        incompleto. <strong>Blacklist</strong> e <strong>responsável</strong> são marcas permanentes
        da empresa — valem para todas as rodadas.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- filtro */

function CaixaSelecao({
  rotulo, opcoes, selecionados, onMudar, larga,
}: {
  rotulo: string;
  opcoes: { id: string; nome: string }[];
  selecionados: string[];
  onMudar: (v: string[]) => void;
  larga?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(ev.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const visiveis = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? opcoes.filter((o) => o.nome.toLowerCase().includes(q)) : opcoes;
  }, [opcoes, filtro]);

  function alternar(id: string) {
    onMudar(selecionados.includes(id)
      ? selecionados.filter((x) => x !== id)
      : [...selecionados, id]);
  }

  const resumo = selecionados.length === 0
    ? rotulo
    : selecionados.length === 1
      ? (opcoes.find((o) => o.id === selecionados[0])?.nome ?? rotulo)
      : `${rotulo}: ${selecionados.length}`;

  return (
    <div className="multi" ref={caixa}>
      <button
        className={`chip ${selecionados.length > 0 ? "on" : ""}`}
        onClick={() => setAberto((v) => !v)}
      >
        {resumo} ▾
      </button>
      {aberto && (
        <div className={`multi-lista ${larga ? "larga" : ""}`}>
          {opcoes.length > 8 && (
            <input
              className="multi-busca"
              placeholder="Filtrar…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              autoFocus
            />
          )}
          <div className="multi-itens">
            {visiveis.map((o) => (
              <label key={o.id} className="multi-item">
                <input
                  type="checkbox"
                  checked={selecionados.includes(o.id)}
                  onChange={() => alternar(o.id)}
                />
                <span>{o.nome}</span>
              </label>
            ))}
            {visiveis.length === 0 && <div className="multi-vazio">Nada encontrado.</div>}
          </div>
          {selecionados.length > 0 && (
            <button className="multi-limpar" onClick={() => onMudar([])}>Limpar seleção</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------- tabela com rolagem no topo */

/**
 * Espelha a barra de rolagem horizontal acima da tabela: numa tabela larga,
 * a barra de baixo fica fora da tela e ninguém a encontra.
 */
function TabelaComRolagemNoTopo({ children }: { children: React.ReactNode }) {
  const topo = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => setLargura(el.scrollWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const sincronizar = (de: HTMLDivElement | null, para: HTMLDivElement | null) => () => {
    if (de && para && para.scrollLeft !== de.scrollLeft) para.scrollLeft = de.scrollLeft;
  };

  return (
    <>
      <div className="rolagem-topo" ref={topo} onScroll={sincronizar(topo.current, corpo.current)}>
        <div style={{ width: largura, height: 1 }} />
      </div>
      <div className="table-wrap fixa" ref={corpo} onScroll={sincronizar(corpo.current, topo.current)}>
        {children}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- linha */

function LinhaEmpresa({
  e, st, base, calc, sujo, anos, salvando, onAbrir, onEditar,
}: {
  e: PerfilEmpresa;
  st: Rascunho;
  base: number | null;
  calc: ReturnType<typeof calcular>;
  sujo: boolean;
  anos: number[];
  salvando: boolean;
  onAbrir: () => void;
  onEditar: (campos: Partial<Rascunho>) => void;
}) {
  return (
      <tr className={`${calc.individual ? "tem-ajuste" : ""} ${sujo ? "nao-salvo" : ""}`}>
        <td className="col-empresa">
          <span className="emp-nome">
            {e.nome ?? `Empresa #${e.codigoempresa}`}
            {st.blacklist && <span className="tag-black" title={st.blacklist_motivo || "cliente complexo"}>BL</span>}
            {e.codigocliente_ativo === false && <span className="tag-inativa">inativa</span>}
            {sujo && <span className="tag-nao-salvo" title="alteração ainda não salva">•</span>}
          </span>
          <span className="cnpj">
            <span className="codigo">fin. {e.codigocliente ?? "—"}</span>
            {" · "}emp. {e.codigoempresa}
            {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
          </span>
          <button className="btn-detalhes" onClick={onAbrir} aria-haspopup="dialog">
            Abrir detalhes
          </button>
        </td>
        <td className="atividade" title={e.atividade?.descricao ?? ""}>{e.atividade?.descricao ?? "—"}</td>
        <td className="regime">{e.regime ?? "—"}</td>
        <td className="regime">
          <select
            className="mini-sel"
            value={st.responsavel}
            disabled={salvando}
            onChange={(ev) => onEditar({ responsavel: ev.target.value })}
          >
            <option value="">—</option>
            {RESPONSAVEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </td>
        <td className="num">
          <input
            type="checkbox"
            checked={st.blacklist}
            disabled={salvando}
            title="Cliente problemático ou complexo"
            onChange={(ev) => onEditar({ blacklist: ev.target.checked })}
          />
        </td>

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
            <td key={`${a}m`} className="ano num"
                title={a === new Date().getFullYear() ? "Honorário vigente hoje" : `Vigente em 31/12/${a}`}>
              {mensalidadeDoAno(e, a) !== null ? formatBRL(mensalidadeDoAno(e, a)) : "—"}
            </td>,
          ];
        })}

        <td className="sim num">{base === null ? "—" : formatBRL(base)}</td>
        <td className="sim">
          <input
            className="mini" inputMode="decimal" value={st.percentual} disabled={salvando}
            placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
            onChange={(ev) => onEditar({ percentual: ev.target.value, valor_novo: "" })}
          />
        </td>
        <td className="sim">
          <input
            className="mini" inputMode="decimal" value={st.valor_novo} disabled={salvando}
            placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
            onChange={(ev) => onEditar({ valor_novo: ev.target.value, percentual: "" })}
          />
        </td>
        <td className={`sim num ${(calc.diferenca ?? 0) < 0 ? "res-div" : ""}`}>
          {calc.diferenca === null ? "—" : formatBRL(calc.diferenca)}
        </td>
      </tr>
  );
}

/* ------------------------------------------------------- modal da empresa */

function ModalEmpresa({
  e, st, base, calc, gravado, anos, salvando, onFechar, onEditar,
}: {
  e: PerfilEmpresa;
  st: Rascunho;
  base: number | null;
  calc: ReturnType<typeof calcular>;
  gravado: Ajuste | undefined;
  anos: number[];
  salvando: boolean;
  onFechar: () => void;
  onEditar: (campos: Partial<Rascunho>) => void;
}) {
  const [servicos, setServicos] = useState<PerfilServico[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (servicos !== null || buscando) return;
    setBuscando(true);
    fetch(`/api/dissidio/empresa/${e.codigoempresa}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setServicos(j.servicos ?? []))
      .catch(() => setServicos([]))
      .finally(() => setBuscando(false));
  }, [servicos, buscando, e.codigoempresa]);

  // Fecha com Esc, como qualquer diálogo.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") onFechar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
  <div className="modal-bg" onClick={onFechar}>
        <div className="modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="tk-crumbs">
                fin. {e.codigocliente ?? "—"} · emp. {e.codigoempresa}
                {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
              </div>
              <h2>{e.nome ?? `Empresa #${e.codigoempresa}`}</h2>
            </div>
            <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
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
                <div className="ajuda">{calc.individual ? "ajuste desta empresa" : "percentual geral"}</div>
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
                  inputMode="decimal" value={st.percentual} disabled={salvando}
                  placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
                  onChange={(ev) => onEditar({ percentual: ev.target.value, valor_novo: "" })}
                />
              </label>
              <label className="campo-inline">
                <span>ou valor novo (R$)</span>
                <input
                  inputMode="decimal" value={st.valor_novo} disabled={salvando}
                  placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
                  onChange={(ev) => onEditar({ valor_novo: ev.target.value, percentual: "" })}
                />
              </label>
              <label className="campo-inline">
                <span>Responsável pela validação</span>
                <select
                  className="sel" value={st.responsavel} disabled={salvando}
                  onChange={(ev) => onEditar({ responsavel: ev.target.value })}
                >
                  <option value="">Sem responsável</option>
                  {RESPONSAVEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </label>
            </div>
            <p className="nota">
              Preencha percentual <em>ou</em> valor — o outro é calculado. Em branco, a empresa segue
              o percentual geral da rodada.
            </p>

            <h3>Cliente complexo (blacklist)</h3>
            <label className="check-linha">
              <input
                type="checkbox" checked={st.blacklist} disabled={salvando}
                onChange={(ev) => onEditar({ blacklist: ev.target.checked })}
              />
              <span>Marcar como cliente problemático ou complexo</span>
            </label>
            {st.blacklist && (
              <label className="campo-inline larga" style={{ marginTop: 8 }}>
                <span>Motivo</span>
                <input
                  value={st.blacklist_motivo} disabled={salvando}
                  onChange={(ev) => onEditar({ blacklist_motivo: ev.target.value })}
                  placeholder="Ex.: envia documentação sempre fora do prazo."
                />
              </label>
            )}
            <p className="nota">
              Esta marca pertence à <strong>empresa</strong>, não à rodada — vale para os próximos anos.
            </p>

            <h3>Observação desta empresa</h3>
            <textarea
              rows={3} value={st.observacao} disabled={salvando} style={{ width: "100%" }}
              onChange={(ev) => onEditar({ observacao: ev.target.value })}
              placeholder="Ex.: cliente em negociação, reajuste escalonado a partir de julho."
            />

            {gravado && (
              <p className="nota" style={{ marginTop: 10 }}>
                Última gravação por <strong>{gravado.analisado_por ?? "—"}</strong>
                {gravado.analisado_em && ` em ${new Date(gravado.analisado_em).toLocaleString("pt-BR")}`}.
                {gravado.valor_base !== null && <> Base congelada: R$ {formatBRL(gravado.valor_base)}.</>}
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
                          {parcial && <span className="parcial" title={`${y?.meses_considerados} meses`}>*</span>}
                        </td>
                        <td className="num">{y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—"}</td>
                        <td className="num">{formatNum(y?.empregados_media_mes ?? null)}</td>
                        <td className="num">{formatNum(y?.horas_media_mes ?? null)}</td>
                        <td className="num"
                            title={a === new Date().getFullYear() ? "Honorário vigente hoje" : `Vigente em 31/12/${a}`}>
                          {mensalidadeDoAno(e, a) !== null ? formatBRL(mensalidadeDoAno(e, a)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3>Serviços contratados</h3>
            {buscando && <p className="nota">Carregando…</p>}
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
            {calc.individual && (
              <button
                className="btn"
                disabled={salvando}
                onClick={() => onEditar({ percentual: "", valor_novo: "" })}
              >
                Voltar ao percentual geral
              </button>
            )}{" "}
            <button className="btn primary" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
  );
}
