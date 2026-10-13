"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { dataBR, diasEntre } from "@/lib/pessoas/ferias";
import {
  sinalDoAquisitivo, diasAte, limiteSugerido, fimAquisitivoSugerido, ROTULO_SINAL, type Sinal,
} from "@/lib/pessoas/ferias-controle";

// Quadros abaixo de "Solicitar férias":
//   • Programar férias — líder do setor (ou Márcio) lança as datas combinadas.
//   • Períodos aquisitivos — Márcio cadastra aquisitivo e data limite
//     (à mão ou buscando no Questor). Sem programação perto do limite: vermelho.

interface Aquisitivo {
  id: number; inicio_aquisitivo: string; fim_aquisitivo: string; limite_gozo: string;
  saldo: number | null; origem: string; observacao: string | null;
}
interface Programacao {
  id: number; status: string; origem: string; aquisitivo_id: number | null;
  programado_por: string | null; periodos: { inicio: string; fim: string }[];
}
interface Pessoa { id: number; nome: string; setor: string; email: string | null; aquisitivos: Aquisitivo[]; programacoes: Programacao[] }

const CLASSE: Record<Sinal, string> = {
  ok: "sit-ok", aguardando: "sit-observar", prazo: "badge-soft", atencao: "sit-observar",
  critico: "sit-critico", vencido: "sit-critico", "sem-cadastro": "sit-critico",
};
const PESO: Record<Sinal, number> = { vencido: 0, critico: 1, "sem-cadastro": 2, atencao: 3, aguardando: 4, prazo: 5, ok: 6 };

function hojeISO() { return new Date().toISOString().slice(0, 10); }

export default function ProgramacaoFerias() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [papel, setPapel] = useState<{ controle: boolean; todos: boolean; setor: string | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<{ tipo: "programar" | "aquisitivo"; pessoa: number; aq?: Aquisitivo } | null>(null);
  const [setor, setSetor] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    const r = await fetch("/api/pessoas/ferias/controle", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setPessoas(j.pessoas ?? []); setPapel(j.papel); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Uma linha por período aquisitivo; pessoa sem cadastro vira uma linha vermelha.
  const linhas = useMemo(() => {
    const out: { p: Pessoa; aq: Aquisitivo | null; sinal: Sinal }[] = [];
    for (const p of pessoas) {
      if (setor && p.setor !== setor) continue;
      if (p.aquisitivos.length === 0) { out.push({ p, aq: null, sinal: "sem-cadastro" }); continue; }
      for (const aq of p.aquisitivos) out.push({ p, aq, sinal: sinalDoAquisitivo(aq, p.programacoes, hoje) });
    }
    return out.sort((a, b) => PESO[a.sinal] - PESO[b.sinal] || a.p.nome.localeCompare(b.p.nome));
  }, [pessoas, setor, hoje]);

  const setores = useMemo(() => [...new Set(pessoas.map((p) => p.setor))].sort(), [pessoas]);
  const vermelhos = linhas.filter((l) => l.sinal === "critico" || l.sinal === "vencido").length;

  if (carregando || !papel) return null;

  async function importar() {
    setImportando(true); setMsg(null);
    const r = await fetch("/api/pessoas/ferias/aquisitivos/questor", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setImportando(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao buscar no Questor." }); return; }
    const partes = [`${j.importados} período(s) importado(s) do Questor (base ${dataBR(j.dataBase)}).`];
    if (j.semVinculo?.length) partes.push(`Sem cadastro em Pessoas: ${j.semVinculo.join(", ")}.`);
    if (j.antigos?.length) partes.push(`${j.antigos.length} período(s) com limite vencido há mais de 1 ano ficaram de fora (conferir no Questor).`);
    setMsg({ ok: true, texto: partes.join(" ") });
    carregar();
  }

  async function excluir(id: number) {
    if (!window.confirm("Excluir este período aquisitivo?")) return;
    const r = await fetch(`/api/pessoas/ferias/aquisitivos?id=${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMsg({ ok: false, texto: j.error ?? "Falha ao excluir." }); else carregar();
  }

  return (
    <section className="bloco-edit" style={{ marginTop: 18 }}>
      <div className="fpg-head">
        <div>
          <h3>Programar férias</h3>
          <p className="sub-info">
            Preenchimento feito pelo <strong>líder do setor</strong>
            {papel.controle ? " ou por você (controle de férias)" : ""}. As datas entram aprovadas,
            vão para a agenda e a pessoa é avisada. O período aquisitivo e a data limite são
            cadastrados pelo Márcio.
          </p>
        </div>
        <div className="fpg-acoes">
          {papel.todos && (
            <select className="search" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos os setores</option>
              {setores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {papel.controle && (
            <button className="btn" onClick={importar} disabled={importando}
                    title="Busca os períodos aquisitivos abertos no Questor (GET /rh/ferias-a-vencer)">
              {importando ? "Buscando…" : "Buscar do Questor"}
            </button>
          )}
        </div>
      </div>

      {vermelhos > 0 && (
        <div className="banner error">{vermelhos} período(s) sem programação perto do limite ou já vencido(s).</div>
      )}
      {msg && <div className={`banner ${msg.ok ? "" : "error"}`}>{msg.texto}</div>}

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Pessoa</th>
              <th>Período aquisitivo</th>
              <th>Limite p/ início</th>
              <th className="c-res">Situação</th>
              <th>Programado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={6} className="vazio">Ninguém no seu alcance.</td></tr>
            )}
            {linhas.map(({ p, aq, sinal }) => {
              const progs = p.programacoes.filter((x) => !aq || x.aquisitivo_id === aq.id
                || x.periodos.some((y) => y.inicio > aq.fim_aquisitivo && y.inicio <= aq.limite_gozo));
              const chave = `${p.id}-${aq?.id ?? "x"}`;
              const abrirProg = aberto?.tipo === "programar" && aberto.pessoa === p.id && (aberto.aq?.id ?? null) === (aq?.id ?? null);
              const abrirAq = aberto?.tipo === "aquisitivo" && aberto.pessoa === p.id && (aberto.aq?.id ?? null) === (aq?.id ?? null);
              const d = aq ? diasAte(aq.limite_gozo, hoje) : null;
              return (
                <Fragment key={chave}>
                  <tr className={sinal === "critico" || sinal === "vencido" ? "fpg-alerta" : ""}>
                    <td className="col-empresa">
                      <span className="emp-nome">{p.nome}</span>
                      <span className="obs">{p.setor}</span>
                    </td>
                    <td className="mut">
                      {aq ? `${dataBR(aq.inicio_aquisitivo)} a ${dataBR(aq.fim_aquisitivo)}` : <em>não cadastrado</em>}
                      {aq?.saldo != null && <span className="obs">saldo {aq.saldo} dias{aq.origem === "questor" ? " · Questor" : ""}</span>}
                    </td>
                    <td className="mut">
                      {aq ? dataBR(aq.limite_gozo) : "–"}
                      {d != null && sinal !== "ok" && (
                        <span className="obs">{d < 0 ? `vencido há ${-d} dias` : `faltam ${d} dias`}</span>
                      )}
                    </td>
                    <td className="c-res"><span className={`badge ${CLASSE[sinal]}`}>{ROTULO_SINAL[sinal]}</span></td>
                    <td className="mut">
                      {progs.length === 0 ? <span className="dash">–</span> : progs.map((x) => (
                        <span key={x.id} className="obs">
                          {x.periodos.map((y) => `${dataBR(y.inicio)} a ${dataBR(y.fim)}`).join(" · ")}
                          {" "}({x.status === "pendente" ? "pedido aguardando" : x.origem === "solicitacao" ? "pedido aprovado" : x.origem === "rh" ? "programado pelo RH" : "programado pelo líder"})
                        </span>
                      ))}
                    </td>
                    <td className="c-res fpg-botoes">
                      <button className="btn" onClick={() => setAberto(abrirProg ? null : { tipo: "programar", pessoa: p.id, aq: aq ?? undefined })}>
                        Programar
                      </button>
                      {papel.controle && (
                        <button className="btn" onClick={() => setAberto(abrirAq ? null : { tipo: "aquisitivo", pessoa: p.id, aq: aq ?? undefined })}>
                          {aq ? "Editar período" : "Cadastrar período"}
                        </button>
                      )}
                      {papel.controle && aq && (
                        <button className="btn-remover" title="Excluir período" onClick={() => excluir(aq.id)}>✕</button>
                      )}
                    </td>
                  </tr>
                  {abrirProg && (
                    <tr><td colSpan={6}>
                      <FormProgramar pessoa={p} aq={aq} onFim={(t) => { setAberto(null); setMsg({ ok: true, texto: t }); carregar(); }} />
                    </td></tr>
                  )}
                  {abrirAq && (
                    <tr><td colSpan={6}>
                      <FormAquisitivo pessoa={p} aq={aq} onFim={(t) => { setAberto(null); setMsg({ ok: true, texto: t }); carregar(); }} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {papel.controle && (
        <p className="sub-info" style={{ marginTop: 8 }}>
          Para cadastrar um segundo período da mesma pessoa, use <strong>Cadastrar período</strong> com outro início:
          cada início de aquisitivo vira uma linha.
        </p>
      )}
    </section>
  );
}

function FormProgramar({ pessoa, aq, onFim }: { pessoa: Pessoa; aq: Aquisitivo | null; onFim: (msg: string) => void }) {
  const [periodos, setPeriodos] = useState([{ inicio: "", fim: "" }]);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const total = periodos.filter((p) => p.inicio && p.fim && p.fim >= p.inicio).reduce((s, p) => s + diasEntre(p.inicio, p.fim), 0);
  const foraDoLimite = aq && periodos.some((p) => p.inicio && p.inicio > aq.limite_gozo);

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null);
    const validos = periodos.filter((p) => p.inicio && p.fim);
    if (validos.length === 0) { setErro("Informe ao menos um período."); return; }
    setSalvando(true);
    const r = await fetch("/api/pessoas/ferias/programar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pessoa_id: pessoa.id, periodos: validos, observacao: obs, aquisitivo_id: aq?.id ?? null }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.error ?? "Falha ao programar."); return; }
    onFim(`Férias de ${pessoa.nome} programadas. Já estão na agenda e ${pessoa.nome} foi avisado(a).`);
  }

  return (
    <form className="fpg-form" onSubmit={salvar}>
      <strong>Programar férias de {pessoa.nome}</strong>
      {aq && <span className="sub-info"> · aquisitivo {dataBR(aq.inicio_aquisitivo)} a {dataBR(aq.fim_aquisitivo)}, iniciar até {dataBR(aq.limite_gozo)}</span>}
      {periodos.map((p, i) => (
        <div className="linha-add" key={i}>
          <label className="campo-inline"><span>Início</span>
            <input className="search" type="date" value={p.inicio} onChange={(e) => setPeriodos((ps) => ps.map((x, k) => k === i ? { ...x, inicio: e.target.value } : x))} />
          </label>
          <label className="campo-inline"><span>Fim</span>
            <input className="search" type="date" value={p.fim} onChange={(e) => setPeriodos((ps) => ps.map((x, k) => k === i ? { ...x, fim: e.target.value } : x))} />
          </label>
          <span className="dias-badge">{p.inicio && p.fim && p.fim >= p.inicio ? `${diasEntre(p.inicio, p.fim)} dias` : "—"}</span>
          {periodos.length > 1 && <button type="button" className="btn-remover" onClick={() => setPeriodos((ps) => ps.filter((_, k) => k !== i))}>✕</button>}
        </div>
      ))}
      {periodos.length < 2 && (
        <button type="button" className="btn" onClick={() => setPeriodos((ps) => [...ps, { inicio: "", fim: "" }])}>+ Segundo período</button>
      )}
      <label className="campo"><span>Observação (opcional)</span>
        <input className="search" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: combinado com a pessoa em 10/10" />
      </label>
      {foraDoLimite && <div className="banner error">Atenção: há início depois da data limite ({dataBR(aq!.limite_gozo)}) — férias em dobro.</div>}
      {erro && <div className="banner error">{erro}</div>}
      <div className="fp-acoes">
        <button className="btn primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Programar"}</button>
        {total > 0 && <span className="sub-info">Total: <strong>{total} dias</strong></span>}
      </div>
    </form>
  );
}

function FormAquisitivo({ pessoa, aq, onFim }: { pessoa: Pessoa; aq: Aquisitivo | null; onFim: (msg: string) => void }) {
  const [inicio, setInicio] = useState(aq?.inicio_aquisitivo ?? "");
  const [fim, setFim] = useState(aq?.fim_aquisitivo ?? "");
  const [limite, setLimite] = useState(aq?.limite_gozo ?? "");
  const [saldo, setSaldo] = useState(aq?.saldo != null ? String(aq.saldo) : "30");
  const [obs, setObs] = useState(aq?.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function mudarInicio(v: string) {
    setInicio(v);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const f = fimAquisitivoSugerido(v);
      setFim(f); setLimite(limiteSugerido(f));
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null); setSalvando(true);
    const r = await fetch("/api/pessoas/ferias/aquisitivos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pessoa_id: pessoa.id, inicio_aquisitivo: inicio, fim_aquisitivo: fim, limite_gozo: limite, saldo: Number(saldo.replace(",", ".")) || null, observacao: obs }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.error ?? "Falha ao salvar."); return; }
    onFim(`Período aquisitivo de ${pessoa.nome} salvo.`);
  }

  return (
    <form className="fpg-form" onSubmit={salvar}>
      <strong>Período aquisitivo de {pessoa.nome}</strong>
      <span className="sub-info"> · o fim e o limite são sugeridos (fim + 12 meses − 30 dias) e podem ser ajustados</span>
      <div className="linha-add">
        <label className="campo-inline"><span>Início aquisitivo</span><input className="search" type="date" value={inicio} onChange={(e) => mudarInicio(e.target.value)} /></label>
        <label className="campo-inline"><span>Fim aquisitivo</span><input className="search" type="date" value={fim} onChange={(e) => { setFim(e.target.value); if (e.target.value) setLimite(limiteSugerido(e.target.value)); }} /></label>
        <label className="campo-inline"><span>Limite p/ início do gozo</span><input className="search" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} /></label>
        <label className="campo-inline"><span>Saldo (dias)</span><input className="search" style={{ width: 80 }} value={saldo} onChange={(e) => setSaldo(e.target.value)} /></label>
      </div>
      <label className="campo"><span>Observação (opcional)</span>
        <input className="search" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
      {erro && <div className="banner error">{erro}</div>}
      <div className="fp-acoes"><button className="btn primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar período"}</button></div>
    </form>
  );
}
