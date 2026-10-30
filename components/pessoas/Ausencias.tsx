"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIPOS_AUSENCIA, ROTULO_STATUS, CLASSE_STATUS, quando, type Ausencia } from "@/lib/pessoas/ausencias";

export default function Ausencias({
  chefe, minhas, ehGestor, paraResponder, respondidas,
}: {
  chefe: { nome: string; email: string } | null;
  minhas: Ausencia[];
  ehGestor: boolean;
  paraResponder: Ausencia[];
  respondidas: Ausencia[];
}) {
  const router = useRouter();
  const vazio = { tipo: "banco_horas", data: "", data_fim: "", dia_inteiro: false, hora_inicio: "", hora_fim: "", motivo: "" };
  const [f, setF] = useState(vazio);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<number, string>>({});

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setMsg(null);
    if (!f.data) { setErro("Informe o dia."); return; }
    if (!f.dia_inteiro && (!f.hora_inicio || !f.hora_fim)) { setErro("Informe o horário (início e fim) ou marque dia inteiro."); return; }
    setEnviando(true);
    try {
      const r = await fetch("/api/pessoas/ausencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, data_fim: f.data_fim || f.data }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Falha ao enviar.");
      setMsg(`Solicitação enviada${j.encarregado ? ` para ${j.encarregado}` : ""}. Você será avisado por e-mail e Teams.`);
      setF(vazio);
      router.refresh();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Erro ao enviar.");
    } finally { setEnviando(false); }
  }

  async function agir(id: number, acao: "aprovar" | "rejeitar" | "cancelar") {
    setErro(null); setMsg(null);
    if (acao === "rejeitar" && !respostas[id]?.trim() && !confirm("Negar sem escrever um motivo?")) return;
    const r = await fetch(`/api/pessoas/ausencias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, resposta: respostas[id] ?? "" }) });
    const j = await r.json();
    if (!r.ok || j.error) setErro(j.error || "Não foi possível concluir.");
    else { setMsg(acao === "aprovar" ? "Ausência confirmada. O colaborador foi avisado." : acao === "rejeitar" ? "Ausência negada. O colaborador foi avisado." : "Solicitação cancelada."); router.refresh(); }
  }

  const Tabela = ({ lista, gestor }: { lista: Ausencia[]; gestor?: boolean }) => (
    <div className="table-wrap" style={{ boxShadow: "none" }}>
      <table className="grid">
        <thead>
          <tr>
            {gestor && <th>Colaborador</th>}
            <th className="col-empresa">Quando</th>
            <th>Tipo</th>
            <th className="c-res">Situação</th>
            <th>{gestor && lista.some((a) => a.status === "pendente") ? "Resposta" : "Gestor"}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.id}>
              {gestor && <td><span className="emp-nome">{a.nome}</span><span className="obs">{a.setor}</span></td>}
              <td className="col-empresa">
                <span className="emp-nome">{quando(a)}</span>
                {a.motivo && <span className="obs">{a.motivo}</span>}
              </td>
              <td className="mut">{TIPOS_AUSENCIA[a.tipo] ?? a.tipo}</td>
              <td className="c-res"><span className={`badge ${CLASSE_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span></td>
              <td className="mut">
                {gestor && a.status === "pendente" ? (
                  <input className="search" placeholder="Resposta (opcional)" value={respostas[a.id] ?? ""} onChange={(e) => setRespostas({ ...respostas, [a.id]: e.target.value })} />
                ) : (
                  <>
                    {a.aprovador_nome ?? <span className="dash">–</span>}
                    {a.resposta && <span className={`obs${a.status === "rejeitada" ? " obs-div" : ""}`}>{a.resposta}</span>}
                  </>
                )}
              </td>
              <td className="c-res" style={{ whiteSpace: "nowrap" }}>
                {gestor && a.status === "pendente" && (
                  <>
                    <button className="btn primary" onClick={() => agir(a.id, "aprovar")}>Confirmar</button>{" "}
                    <button className="btn" onClick={() => agir(a.id, "rejeitar")}>Negar</button>
                  </>
                )}
                {!gestor && a.status === "pendente" && (
                  <button className="btn-remover" onClick={() => agir(a.id, "cancelar")} title="Cancelar">✕</button>
                )}
              </td>
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

      {ehGestor && (
        <section className="bloco-edit">
          <h3>Para responder {paraResponder.length > 0 && <span className="badge sit-observar">{paraResponder.length}</span>}</h3>
          {paraResponder.length === 0 ? <p className="vazio">Nenhuma solicitação aguardando sua resposta.</p> : <Tabela lista={paraResponder} gestor />}
        </section>
      )}

      <section className="bloco-edit" style={{ marginTop: ehGestor ? 18 : 0 }}>
        <h3>Solicite</h3>
        <p className="sub-info">
          Peça dias de descanso (banco de horas) e demais ausências. Cite o dia e o horário; fica a seu critério justificar o motivo.
          {chefe && <> Quem responde é <strong>{chefe.nome}</strong>.</>}
        </p>
        <form onSubmit={enviar}>
          <div className="linha-add">
            <label className="campo-inline">
              <span>Tipo</span>
              <select className="search" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                {Object.entries(TIPOS_AUSENCIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
            <label className="campo-inline">
              <span>Dia</span>
              <input className="search" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
            </label>
            <label className="campo-inline">
              <span>Até (se for mais de um dia)</span>
              <input className="search" type="date" value={f.data_fim} min={f.data || undefined} onChange={(e) => setF({ ...f, data_fim: e.target.value, dia_inteiro: e.target.value && e.target.value !== f.data ? true : f.dia_inteiro })} />
            </label>
            <label className="campo-inline" style={{ alignSelf: "end" }}>
              <span><input type="checkbox" checked={f.dia_inteiro} onChange={(e) => setF({ ...f, dia_inteiro: e.target.checked })} /> Dia inteiro</span>
            </label>
            {!f.dia_inteiro && (
              <>
                <label className="campo-inline">
                  <span>Das</span>
                  <input className="search" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
                </label>
                <label className="campo-inline">
                  <span>Às</span>
                  <input className="search" type="time" value={f.hora_fim} onChange={(e) => setF({ ...f, hora_fim: e.target.value })} />
                </label>
              </>
            )}
          </div>
          <label className="campo" style={{ marginTop: 14 }}>
            <span>Motivo (opcional)</span>
            <textarea rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Se quiser, explique o motivo." />
          </label>
          <div className="fp-acoes" style={{ marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitação"}</button>
          </div>
        </form>
      </section>

      <section className="bloco-edit" style={{ marginTop: 18 }}>
        <h3>Resposta — minhas solicitações</h3>
        {minhas.length === 0 ? <p className="vazio">Você ainda não pediu ausências.</p> : <Tabela lista={minhas} />}
      </section>

      {ehGestor && respondidas.length > 0 && (
        <section className="bloco-edit" style={{ marginTop: 18 }}>
          <h3>Respondidas recentemente</h3>
          <Tabela lista={respondidas} gestor />
        </section>
      )}
    </>
  );
}
