"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRL } from "@/lib/conciliacao";
import { ISENCOES, sugerirIrrf, type PlanoLucro } from "@/lib/lucros-distribuidos";
import type { LinhaLogLucro } from "@/lib/lucros-distribuidos-log";
import type { LucroLancadoQuestor } from "@/lib/questor";

interface Resultado {
  plano: PlanoLucro;
  nomeEmpresa: string | null;
  nomeSocio: string | null;
  chave: string;
  gravacaoLiberada: boolean;
  motivoBloqueio: string | null;
  jaLancadoEm: string | null;
}

interface Ajuste {
  item: LucroLancadoQuestor;
  competencia: string;
  dataPagamento: string;
  rendimento: string;
  base: string;
  imposto: string;
  tisencao: number;
}

const campo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
const entrada: React.CSSProperties = {
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  borderRadius: 9, padding: "8px 10px", fontSize: 14, minWidth: 0,
};

const reais = (n: number) => `R$ ${formatBRL(n)}`;
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** "1.234,56" ou "1234.56" → número. */
function num(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}
const texto = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "");

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LucrosDistribuidos({
  empresas, logInicial, erroServidor,
}: {
  empresas: Array<{ codigo: number; nome: string }>;
  logInicial: LinhaLogLucro[];
  erroServidor: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [socios, setSocios] = useState<Array<{ codigo: number; nome: string }>>([]);
  const [socio, setSocio] = useState("");
  const [competencia, setCompetencia] = useState(hoje().slice(0, 7));
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [rendimento, setRendimento] = useState("");
  const [base, setBase] = useState("");
  const [imposto, setImposto] = useState("");
  const [tisencao, setTisencao] = useState(1);

  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [log, setLog] = useState<LinhaLogLucro[]>(logInicial);

  // Lançamentos já gravados no Questor (de onde se ajusta e se exclui).
  const [inicio, setInicio] = useState(`${new Date().getFullYear()}-01-01`);
  const [fim, setFim] = useState(hoje());
  const [lista, setLista] = useState<LucroLancadoQuestor[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);

  const codigo = useMemo(() => {
    const m = busca.trim().match(/^(\d{1,4})\b/);
    const n = m ? Number(m[1]) : NaN;
    return empresas.some((e) => e.codigo === n) ? n : null;
  }, [busca, empresas]);
  const nomeEscolhida = empresas.find((e) => e.codigo === codigo)?.nome ?? "";

  // Sócios atuais da empresa escolhida.
  useEffect(() => {
    setSocios([]); setSocio("");
    if (!codigo) return;
    let vivo = true;
    fetch(`/api/contabil/lucros-distribuidos/socios?empresa=${codigo}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok: bom, j }) => {
        if (!vivo) return;
        if (!bom) { setErro(j.error ?? "Falha ao carregar os sócios."); return; }
        setSocios(j.socios ?? []);
        if ((j.socios ?? []).length === 1) setSocio(String(j.socios[0].codigo));
      })
      .catch(() => vivo && setErro("Falha ao carregar os sócios."));
    return () => { vivo = false; };
  }, [codigo]);

  function recalcularIrrf(rend: string, comp: string) {
    const s = sugerirIrrf(num(rend), comp);
    setBase(texto(s.base)); setImposto(texto(s.imposto));
  }

  const liquido = Math.max(0, num(rendimento) - num(imposto));

  function corpo() {
    return {
      codigoempresa: codigo, codigosocio: Number(socio), competencia, dataPagamento,
      rendimento, baseIrrf: base, imposto, tisencao,
    };
  }

  async function chamar(url: string, body: object) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
    return j;
  }

  async function atualizarLog() {
    const l = await fetch("/api/contabil/lucros-distribuidos/log").then((r) => r.json()).catch(() => null);
    if (l?.log) setLog(l.log);
  }

  async function carregarLista() {
    setErroLista(null);
    const qs = new URLSearchParams({ inicio, fim });
    if (codigo) qs.set("empresa", String(codigo));
    try {
      const r = await fetch(`/api/contabil/lucros-distribuidos/lancamentos?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
      setLista(j.lancamentos ?? []);
    } catch (e) {
      setLista(null);
      setErroLista(e instanceof Error ? e.message : "Falha ao listar os lançamentos.");
    }
  }

  async function simular() {
    setErro(null); setOk(null); setRes(null);
    if (!codigo) { setErro("Escolha uma empresa da lista."); return; }
    if (!socio) { setErro("Escolha o sócio."); return; }
    setOcupado(true);
    try {
      setRes(await chamar("/api/contabil/lucros-distribuidos/calcular", corpo()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao simular.");
    } finally { setOcupado(false); }
  }

  async function lancar() {
    if (!res) return;
    const e = res.plano.entrada;
    if (!window.confirm(
      `Lançar a distribuição no Questor?\n\nEmpresa ${e.codigoempresa} · ${res.nomeSocio ?? "sócio " + e.codigosocio}\n` +
      `Competência ${e.competencia.split("-").reverse().join("/")} · pagamento ${dataBR(e.dataPagamento)}\nRendimento ${reais(e.rendimento)} · IRRF ${reais(e.imposto)}`
    )) return;
    setErro(null); setOk(null); setOcupado(true);
    try {
      const j = await chamar("/api/contabil/lucros-distribuidos/lancar", { ...corpo(), confirmar: true });
      setOk(j.repetido ? "Esta distribuição já estava gravada no Questor — nada novo foi escrito." : "Distribuição lançada no Questor com sucesso.");
      setRes(null); setRendimento(""); setBase(""); setImposto(""); setTisencao(1);
      await atualizarLog();
      if (lista) await carregarLista();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao lançar.");
    } finally { setOcupado(false); }
  }

  function abrirAjuste(item: LucroLancadoQuestor) {
    setErro(null); setOk(null);
    setAjuste({
      item, competencia: item.competencia.slice(0, 7), dataPagamento: item.datalctofis.slice(0, 10),
      rendimento: texto(item.valorrendpago), base: texto(item.basecalcirrf ?? 0), imposto: texto(item.valorimposto ?? 0),
      tisencao: item.tipoisencao ?? 1,
    });
  }

  function corpoAjuste(a: Ajuste) {
    return {
      codigoempresa: a.item.codigoempresa, codigosocio: a.item.codigosocio, chave: a.item.chave,
      dataAtual: a.item.datalctofis.slice(0, 10), competencia: a.competencia, dataPagamento: a.dataPagamento,
      rendimento: a.rendimento, baseIrrf: a.base, imposto: a.imposto, tisencao: a.tisencao,
    };
  }

  async function salvarAjuste() {
    if (!ajuste) return;
    if (!window.confirm("Alterar este lançamento no Questor?")) return;
    setErro(null); setOk(null); setOcupado(true);
    try {
      await chamar("/api/contabil/lucros-distribuidos/ajustar", { ...corpoAjuste(ajuste), confirmar: true });
      setOk("Lançamento alterado no Questor.");
      setAjuste(null);
      await Promise.all([carregarLista(), atualizarLog()]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao alterar.");
    } finally { setOcupado(false); }
  }

  async function excluir(item: LucroLancadoQuestor) {
    if (!window.confirm(
      `Excluir o lançamento?\n\n${item.nomeestab ?? item.codigoempresa} · ${item.nomesocio ?? "sócio " + item.codigosocio}\n` +
      `Competência ${dataBR(item.competencia).slice(3)} · ${reais(item.valorrendpago)}\n\nIsso apaga as linhas fiscal e da DP no Questor.`
    )) return;
    setErro(null); setOk(null); setOcupado(true);
    try {
      await chamar("/api/contabil/lucros-distribuidos/excluir", {
        codigoempresa: item.codigoempresa, codigosocio: item.codigosocio, chave: item.chave,
        dataAtual: item.datalctofis.slice(0, 10), competencia: item.competencia.slice(0, 7),
        rendimento: item.valorrendpago, confirmar: true,
      });
      setOk("Lançamento excluído do Questor.");
      await Promise.all([carregarLista(), atualizarLog()]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally { setOcupado(false); }
  }

  const money = (v: string, set: (s: string) => void, rotulo: string, apos?: (s: string) => void) => (
    <label style={campo}>
      {rotulo}
      <input style={{ ...entrada, textAlign: "right" }} inputMode="decimal" placeholder="0,00" value={v}
        onChange={(e) => { const s = e.target.value.replace(/[^\d.,]/g, ""); set(s); setRes(null); apos?.(s); }} />
    </label>
  );

  const selectIsencao = (valor: number, set: (n: number) => void) => (
    <label style={campo}>
      Tipo de isenção
      <select style={entrada} value={valor} onChange={(e) => { set(Number(e.target.value)); setRes(null); }}>
        {!ISENCOES.some((i) => i.codigo === valor) && <option value={valor}>Código {valor} (atual)</option>}
        {ISENCOES.map((i) => <option key={i.codigo} value={i.codigo}>{i.rotulo}</option>)}
      </select>
    </label>
  );

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" }}>
          <label style={{ ...campo, gridColumn: "span 2" }}>
            Empresa (código ou nome)
            <input style={entrada} list="lucros-empresas" placeholder="Ex.: 1415" value={busca}
              onChange={(e) => { setBusca(e.target.value); setRes(null); }} />
            <datalist id="lucros-empresas">
              {empresas.map((e) => <option key={e.codigo} value={`${e.codigo} · ${e.nome}`} />)}
            </datalist>
          </label>
          <label style={campo}>
            Sócio
            <select style={entrada} value={socio} disabled={!codigo || socios.length === 0}
              onChange={(e) => { setSocio(e.target.value); setRes(null); }}>
              <option value="">{codigo ? (socios.length ? "Escolha…" : "Sem sócios atuais") : "Escolha a empresa"}</option>
              {socios.map((s) => <option key={s.codigo} value={s.codigo}>{s.nome}</option>)}
            </select>
          </label>
          <label style={campo}>
            Competência
            <input style={entrada} type="month" value={competencia}
              onChange={(e) => { setCompetencia(e.target.value); setRes(null); recalcularIrrf(rendimento, e.target.value); }} />
          </label>
          <label style={campo}>
            Data do pagamento
            <input style={entrada} type="date" value={dataPagamento}
              onChange={(e) => { setDataPagamento(e.target.value); setRes(null); }} />
          </label>
        </div>
        {codigo && <div style={{ fontSize: 12, color: "var(--muted, #667)", marginTop: 6 }}>{codigo} · {nomeEscolhida}</div>}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 14 }}>
          {money(rendimento, setRendimento, "Rendimento", (s) => recalcularIrrf(s, competencia))}
          {money(base, setBase, "Base IRRF")}
          {money(imposto, setImposto, "Imposto retido")}
          <label style={campo}>
            Valor líquido
            <input style={{ ...entrada, textAlign: "right", opacity: 0.8 }} readOnly value={liquido ? formatBRL(liquido) : ""} placeholder="0,00" />
          </label>
          {selectIsencao(tisencao, setTisencao)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted, #667)", marginTop: 6 }}>
          IRRF sugerido: 10% sobre o total quando a distribuição passa de R$ 50.000,00, em competências de 2026 em diante. Base e imposto podem ser corrigidos.
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn primary" disabled={ocupado || !codigo || !socio} onClick={simular}>
            {ocupado && !res ? "Consultando…" : "Simular"}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted, #667)" }}>Nada é gravado até você confirmar.</span>
        </div>
      </div>

      {erro && <div className="banner error">{erro}</div>}
      {ok && <div className="banner">{ok}</div>}

      {res && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <strong>{res.nomeEmpresa ?? nomeEscolhida}</strong>
            <span className="badge badge-soft">Sócio: {res.nomeSocio ?? res.plano.entrada.codigosocio}</span>
          </div>
          {res.jaLancadoEm && (
            <div className="banner error">Esta mesma distribuição já foi lançada em {new Date(res.jaLancadoEm).toLocaleString("pt-BR")}.</div>
          )}
          {res.motivoBloqueio && <div className="banner error">{res.motivoBloqueio}</div>}

          <h3 style={{ fontSize: 14, margin: "8px 0" }}>Fiscal — OUTRORENDIMENTOPAGO</h3>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="grid">
              <thead>
                <tr><th>Competência</th><th>Data lcto</th><th>Natureza</th><th>Rendimento</th><th>Base IRRF</th><th>Alíq.</th><th>IRRF</th><th>Isenção</th><th>Valor isento</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{dataBR(res.plano.fiscal.competencia).slice(3)}</td><td>{dataBR(res.plano.fiscal.datalctofis)}</td>
                  <td>{res.plano.fiscal.codigonaturezarendimento}</td><td>{reais(res.plano.fiscal.valorrendpago)}</td>
                  <td>{reais(res.plano.fiscal.basecalcirrf)}</td><td>{res.plano.fiscal.aliquota ?? "—"}</td>
                  <td>{res.plano.fiscal.valorimposto != null ? reais(res.plano.fiscal.valorimposto) : "—"}</td>
                  <td>{res.plano.fiscal.tipoisencao}</td><td>{reais(res.plano.fiscal.valorisencao)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 14, margin: "8px 0" }}>DP — INFORMERENDIMENTOOUTREND</h3>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th style={{ textAlign: "left" }}>Descrição</th><th>Data pgto</th><th>Valor</th><th>IRRF</th><th>Imposto</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{ textAlign: "left" }}>{res.plano.dp.descricaorendimento}</td><td>{dataBR(res.plano.dp.datapgto)}</td>
                  <td>{reais(res.plano.dp.valorrendimento)}</td><td>{reais(res.plano.dp.valorirrf)}</td>
                  <td>{res.plano.dp.codigoimposto}/{res.plano.dp.variacaoimposto}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" disabled={ocupado || !res.gravacaoLiberada || !!res.jaLancadoEm} onClick={lancar}>
              {ocupado ? "Lançando…" : "Lançar no Questor"}
            </button>
            <span style={{ fontSize: 13 }}>Líquido {reais(res.plano.liquido)}</span>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Lançamentos no Questor</h3>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <label style={campo}>De<input style={entrada} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
          <label style={campo}>Até<input style={entrada} type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          <button className="btn" onClick={carregarLista} disabled={ocupado}>Buscar{codigo ? ` (empresa ${codigo})` : " (todas)"}</button>
        </div>
        {erroLista && <div className="banner error" style={{ marginTop: 10 }}>{erroLista}</div>}

        {ajuste && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <strong>Alterar lançamento</strong>
            <span style={{ fontSize: 13, marginLeft: 8 }}>{ajuste.item.nomeestab} · {ajuste.item.nomesocio}</span>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 10 }}>
              <label style={campo}>Competência
                <input style={entrada} type="month" value={ajuste.competencia}
                  onChange={(e) => {
                    const comp = e.target.value;
                    const s = sugerirIrrf(num(ajuste.rendimento), comp);
                    setAjuste({ ...ajuste, competencia: comp, base: texto(s.base), imposto: texto(s.imposto) });
                  }} />
              </label>
              <label style={campo}>Data do pagamento
                <input style={entrada} type="date" value={ajuste.dataPagamento} onChange={(e) => setAjuste({ ...ajuste, dataPagamento: e.target.value })} />
              </label>
              <label style={campo}>Rendimento
                <input style={{ ...entrada, textAlign: "right" }} inputMode="decimal" value={ajuste.rendimento}
                  onChange={(e) => {
                    const r = e.target.value.replace(/[^\d.,]/g, "");
                    const s = sugerirIrrf(num(r), ajuste.competencia);
                    setAjuste({ ...ajuste, rendimento: r, base: texto(s.base), imposto: texto(s.imposto) });
                  }} />
              </label>
              <label style={campo}>Base IRRF
                <input style={{ ...entrada, textAlign: "right" }} inputMode="decimal" value={ajuste.base}
                  onChange={(e) => setAjuste({ ...ajuste, base: e.target.value.replace(/[^\d.,]/g, "") })} />
              </label>
              <label style={campo}>Imposto retido
                <input style={{ ...entrada, textAlign: "right" }} inputMode="decimal" value={ajuste.imposto}
                  onChange={(e) => setAjuste({ ...ajuste, imposto: e.target.value.replace(/[^\d.,]/g, "") })} />
              </label>
              {selectIsencao(ajuste.tisencao, (n) => setAjuste({ ...ajuste, tisencao: n }))}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button className="btn primary" disabled={ocupado} onClick={salvarAjuste}>{ocupado ? "Salvando…" : "Salvar alteração"}</button>
              <button className="btn" disabled={ocupado} onClick={() => setAjuste(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {lista && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Empresa</th><th style={{ textAlign: "left" }}>Sócio</th><th>Comp.</th><th>Data lcto</th>
                <th>Rendimento</th><th>IRRF</th><th>Líquido</th><th>Isenção</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center" }}>Nenhum lançamento no período.</td></tr>}
              {lista.map((l) => (
                <tr key={`${l.codigoempresa}-${l.chave}`}>
                  <td style={{ textAlign: "left" }}>{l.codigoempresa} · {l.nomeestab ?? ""}</td>
                  <td style={{ textAlign: "left" }}>{l.nomesocio ?? l.codigosocio}</td>
                  <td>{dataBR(l.competencia).slice(3)}</td><td>{dataBR(l.datalctofis)}</td>
                  <td>{formatBRL(l.valorrendpago)}</td><td>{formatBRL(l.valorimposto ?? 0)}</td>
                  <td>{formatBRL(l.valorrendpago - (l.valorimposto ?? 0))}</td><td>{l.tipoisencao ?? 1}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn" disabled={ocupado} onClick={() => abrirAjuste(l)}>Alterar</button>{" "}
                    <button className="btn" disabled={ocupado} onClick={() => excluir(l)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Histórico de operações</h3>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Quando</th><th style={{ textAlign: "left" }}>Empresa</th><th style={{ textAlign: "left" }}>Sócio</th>
              <th>Comp.</th><th>Operação</th><th>Rendimento</th><th>IRRF</th><th>Status</th><th style={{ textAlign: "left" }}>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center" }}>Nenhuma operação ainda.</td></tr>}
            {log.map((l) => (
              <tr key={l.id} title={l.erro ?? undefined}>
                <td style={{ textAlign: "left" }}>{new Date(l.criado_em).toLocaleString("pt-BR")}</td>
                <td style={{ textAlign: "left" }}>{l.codigoempresa} · {l.nome_empresa ?? ""}</td>
                <td style={{ textAlign: "left" }}>{l.nome_socio ?? l.codigosocio}</td>
                <td>{l.competencia.split("-").reverse().join("/")}</td>
                <td>{l.operacao === "lancamento" ? "1º lançamento" : l.operacao === "ajuste" ? "Alterado" : "Excluído"}</td>
                <td>{formatBRL(l.rendimento)}</td><td>{formatBRL(l.imposto)}</td>
                <td><span className="badge badge-soft">{l.status === "erro" ? "Erro" : l.status === "excluido" ? "Excluído depois" : "OK"}</span></td>
                <td style={{ textAlign: "left" }}>{l.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
