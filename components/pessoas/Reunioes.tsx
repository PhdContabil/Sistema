"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dataBR, diaSemana, horario, type Reuniao } from "@/lib/pessoas/reunioes";

const VAZIO = { id: 0, titulo: "", data: "", hora_inicio: "", hora_fim: "", local: "", link: "", participantes: "Todos", pauta: "", avisar: true };

export default function Reunioes({ proximas, passadas, podeAgendar }: { proximas: Reuniao[]; passadas: Reuniao[]; podeAgendar: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function editar(r: Reuniao) {
    setF({ id: r.id, titulo: r.titulo, data: r.data, hora_inicio: r.hora_inicio, hora_fim: r.hora_fim ?? "", local: r.local, link: r.link ?? "", participantes: r.participantes ?? "", pauta: r.pauta ?? "", avisar: false });
    setAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setMsg(null); setEnviando(true);
    try {
      const r = await fetch("/api/pessoas/reunioes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Falha ao salvar.");
      setMsg(f.id ? "Reunião alterada." : `Reunião marcada${f.avisar ? " e avisada no canal do Teams" : ""}.`);
      setF(VAZIO); setAberto(false);
      router.refresh();
    } catch (e2) { setErro(e2 instanceof Error ? e2.message : "Erro ao salvar."); }
    finally { setEnviando(false); }
  }

  async function excluir(r: Reuniao) {
    if (!confirm(`Excluir a reunião "${r.titulo}" de ${dataBR(r.data)}?`)) return;
    const x = await fetch(`/api/pessoas/reunioes/${r.id}`, { method: "DELETE" });
    const j = await x.json();
    if (!x.ok || j.error) setErro(j.error || "Não foi possível excluir.");
    else { setMsg("Reunião excluída."); router.refresh(); }
  }

  const Lista = ({ itens, antigas }: { itens: Reuniao[]; antigas?: boolean }) => (
    <div className="table-wrap" style={{ boxShadow: "none" }}>
      <table className="grid">
        <thead>
          <tr>
            <th>Data</th>
            <th>Horário</th>
            <th className="col-empresa">Reunião</th>
            <th>Local</th>
            <th>Participantes</th>
            {podeAgendar && !antigas && <th></th>}
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => (
            <tr key={r.id}>
              <td><span className="emp-nome">{dataBR(r.data)}</span><span className="obs">{diaSemana(r.data)}</span></td>
              <td className="num">{horario(r)}</td>
              <td className="col-empresa">
                <span className="emp-nome">{r.titulo}</span>
                {r.pauta && <span className="obs" style={{ whiteSpace: "pre-wrap" }}>{r.pauta}</span>}
                <span className="obs">Marcada por {r.criado_por_nome}</span>
              </td>
              <td className="mut">
                {r.local}
                {r.link && <span className="obs"><a href={r.link} target="_blank" rel="noreferrer">Entrar na reunião ↗</a></span>}
              </td>
              <td className="mut">{r.participantes ?? "—"}</td>
              {podeAgendar && !antigas && (
                <td className="c-res" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" onClick={() => editar(r)}>Editar</button>{" "}
                  <button className="btn-remover" title="Excluir" onClick={() => excluir(r)}>✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner error">{erro}</div>}

      {podeAgendar && (
        <section className="bloco-edit">
          <h3>{f.id ? "Editar reunião" : "Marcar reunião"}</h3>
          {!aberto ? (
            <button className="btn primary" onClick={() => setAberto(true)}>+ Nova reunião</button>
          ) : (
            <form onSubmit={salvar}>
              <label className="campo">
                <span>Assunto *</span>
                <input className="search" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Reunião geral de fechamento do mês" />
              </label>
              <div className="linha-add" style={{ marginTop: 10 }}>
                <label className="campo-inline"><span>Data *</span><input className="search" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
                <label className="campo-inline"><span>Início *</span><input className="search" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} /></label>
                <label className="campo-inline"><span>Término</span><input className="search" type="time" value={f.hora_fim} onChange={(e) => setF({ ...f, hora_fim: e.target.value })} /></label>
                <label className="campo-inline" style={{ flex: 1 }}><span>Local *</span><input className="search" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Sala de reunião, endereço ou Teams" /></label>
              </div>
              <div className="linha-add" style={{ marginTop: 10 }}>
                <label className="campo-inline" style={{ flex: 1 }}><span>Link (Teams/online)</span><input className="search" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://teams.microsoft.com/…" /></label>
                <label className="campo-inline" style={{ flex: 1 }}><span>Participantes</span><input className="search" value={f.participantes} onChange={(e) => setF({ ...f, participantes: e.target.value })} placeholder="Todos, setores ou nomes" /></label>
              </div>
              <label className="campo" style={{ marginTop: 10 }}>
                <span>Pauta (opcional)</span>
                <textarea rows={3} value={f.pauta} onChange={(e) => setF({ ...f, pauta: e.target.value })} placeholder="Assuntos que serão tratados." />
              </label>
              <label style={{ display: "block", marginTop: 10, fontSize: 13 }}>
                <input type="checkbox" checked={f.avisar} onChange={(e) => setF({ ...f, avisar: e.target.checked })} /> Avisar no canal do Teams do escritório
              </label>
              <div className="fp-acoes" style={{ marginTop: 14 }}>
                <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Salvando…" : f.id ? "Salvar alterações" : "Marcar reunião"}</button>{" "}
                <button className="btn" type="button" onClick={() => { setF(VAZIO); setAberto(false); }}>Cancelar</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bloco-edit" style={{ marginTop: podeAgendar ? 18 : 0 }}>
        <h3>Próximas reuniões</h3>
        {proximas.length === 0 ? <p className="vazio">Nenhuma reunião marcada.</p> : <Lista itens={proximas} />}
        <p className="sub-info" style={{ marginTop: 8 }}>As reuniões também aparecem na <a href="/m/pessoas/agenda">Agenda mensal</a>.</p>
      </section>

      {passadas.length > 0 && (
        <section className="bloco-edit" style={{ marginTop: 18 }}>
          <h3>Anteriores</h3>
          <Lista itens={passadas} antigas />
        </section>
      )}
    </>
  );
}
