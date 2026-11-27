"use client";

// Página pública (sem login) para o encarregado responder a avaliação do período de experiência.
import { useEffect, useState } from "react";

interface Dados { colaborador: string; fim: string; encarregado: string | null; respondida: boolean }

const CRITERIOS = [
  { campo: "nota_desempenho", rotulo: "Desempenho nas tarefas" },
  { campo: "nota_assiduidade", rotulo: "Assiduidade e pontualidade" },
  { campo: "nota_equipe", rotulo: "Trabalho em equipe" },
  { campo: "nota_aprendizado", rotulo: "Aprendizado e evolução" },
];
const RECS = [
  { v: "efetivar", r: "Efetivar" },
  { v: "prorrogar", r: "Prorrogar a experiência" },
  { v: "nao_efetivar", r: "Não efetivar" },
];
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

export default function AvaliacaoExperiencia({ params }: { params: { token: string } }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [fortes, setFortes] = useState("");
  const [melhorar, setMelhorar] = useState("");
  const [rec, setRec] = useState("");
  const [just, setJust] = useState("");

  useEffect(() => {
    fetch(`/api/avaliacao-experiencia/${params.token}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Link inválido."); return; }
      setD(j);
    }).catch(() => setErro("Não foi possível abrir o formulário."));
  }, [params.token]);

  async function enviar() {
    setErro("");
    if (CRITERIOS.some((c) => !notas[c.campo])) { setErro("Dê uma nota de 1 a 5 em todos os itens."); return; }
    if (fortes.trim().length < 10 || melhorar.trim().length < 10) { setErro("Preencha os pontos fortes e os pontos a melhorar."); return; }
    if (!rec) { setErro("Escolha a recomendação."); return; }
    if (rec !== "efetivar" && just.trim().length < 10) { setErro("Explique a recomendação."); return; }
    setOcupado(true);
    try {
      const r = await fetch(`/api/avaliacao-experiencia/${params.token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notas, pontos_fortes: fortes, pontos_melhorar: melhorar, recomendacao: rec, justificativa: just }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não consegui enviar."); return; }
      setFeito(true);
    } catch { setErro("Sem conexão. Tente de novo."); }
    finally { setOcupado(false); }
  }

  const caixa: React.CSSProperties = { maxWidth: 680, margin: "32px auto", padding: "0 16px" };
  if (erro && !d) return <div style={caixa}><div className="dm-card" style={{ padding: 24 }}><h3>Avaliação de experiência</h3><p>{erro}</p></div></div>;
  if (!d) return <div style={caixa}><p>Carregando…</p></div>;
  if (feito || d.respondida) {
    return (
      <div style={caixa}><div className="dm-card" style={{ padding: 24 }}>
        <h3>{feito ? "Avaliação enviada. Obrigado!" : "Esta avaliação já foi enviada."}</h3>
        <p>A avaliação de <strong>{d.colaborador}</strong> chegou à Gestão de Pessoas. Você não precisa fazer mais nada.</p>
      </div></div>
    );
  }

  return (
    <div style={caixa}>
      <div className="dm-form">
        <h2 style={{ margin: "0 0 4px" }}>Avaliação do período de experiência</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)" }}>
          <strong>{d.colaborador}</strong> · experiência até {dataBR(d.fim)}{d.encarregado ? ` · avaliador: ${d.encarregado}` : ""}
        </p>

        {CRITERIOS.map((c) => (
          <div key={c.campo} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{c.rotulo}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} style={{ flexDirection: "row", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text)" }}>
                  <input type="radio" name={c.campo} checked={notas[c.campo] === n} onChange={() => setNotas({ ...notas, [c.campo]: n })} /> {n}
                </label>
              ))}
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>1 = muito abaixo · 5 = excelente</span>
            </div>
          </div>
        ))}

        <label style={{ marginBottom: 12 }}>Pontos fortes
          <textarea className="sel" rows={3} value={fortes} maxLength={3000} onChange={(e) => setFortes(e.target.value)} placeholder="O que a pessoa faz bem?" />
        </label>
        <label style={{ marginBottom: 12 }}>Pontos a melhorar
          <textarea className="sel" rows={3} value={melhorar} maxLength={3000} onChange={(e) => setMelhorar(e.target.value)} placeholder="O que precisa evoluir?" />
        </label>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Recomendação</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          {RECS.map((x) => (
            <label key={x.v} style={{ flexDirection: "row", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text)" }}>
              <input type="radio" name="rec" checked={rec === x.v} onChange={() => setRec(x.v)} /> {x.r}
            </label>
          ))}
        </div>
        {rec && rec !== "efetivar" && (
          <label style={{ marginBottom: 12 }}>Explique a recomendação
            <textarea className="sel" rows={3} value={just} maxLength={3000} onChange={(e) => setJust(e.target.value)} />
          </label>
        )}

        {erro && <p className="dm-erro">{erro}</p>}
        <div className="dm-form-acoes">
          <button type="button" className="btn primary" disabled={ocupado} onClick={enviar}>{ocupado ? "Enviando…" : "Enviar avaliação"}</button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>
          As respostas são confidenciais: só a Gestão de Pessoas tem acesso. Depois de enviada, a avaliação não pode ser alterada.
        </p>
      </div>
    </div>
  );
}
