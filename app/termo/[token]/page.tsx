"use client";

// Página pública (sem login) para assinar o Termo de Responsabilidade e Uso de Equipamento.
// Depois de assinado, o mesmo link mostra o termo assinado (para imprimir/salvar em PDF).
import { useEffect, useRef, useState } from "react";

interface Dados {
  status: string;
  equipamento: { item: string; marca: string | null; especificacao: string | null; observacao: string | null };
  colaborador: { nome: string; email: string | null; setor: string | null; cpf: string | null };
  data_entrega: string;
  texto: string[];
  assinatura: { nome: string; cpf: string; imagem: string; em: string; hash_texto: string } | null;
}

const fmtCpf = (c: string) => c.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c2, d) => `${a}.${b}.${c2}${d ? "-" + d : ""}`);

export default function TermoPage({ params }: { params: { token: string } }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [aceite, setAceite] = useState(false);
  const [desenhou, setDesenhou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);

  useEffect(() => {
    fetch(`/api/termo/${params.token}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Link inválido."); return; }
      setD(j); setNome(j.colaborador?.nome ?? ""); if (j.colaborador?.cpf) setCpf(fmtCpf(j.colaborador.cpf));
    }).catch(() => setErro("Não foi possível abrir o termo."));
  }, [params.token]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    const down = (e: PointerEvent) => { desenhando.current = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!desenhando.current) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDesenhou(true); };
    const up = () => { desenhando.current = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointerleave", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", up); };
  }, [d]);

  function limpar() { const c = canvas.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDesenhou(false); }

  async function assinar() {
    setErro(null);
    if (!desenhou) { setErro("Desenhe sua assinatura no quadro."); return; }
    setEnviando(true);
    try {
      const r = await fetch(`/api/termo/${params.token}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cpf, aceite, imagem: canvas.current!.toDataURL("image/png") }) });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Não foi possível assinar."); return; }
      setD(j);
    } catch { setErro("Falha de conexão. Tente de novo."); } finally { setEnviando(false); }
  }

  const caixa: React.CSSProperties = { maxWidth: 820, margin: "24px auto", background: "#fff", color: "#111", padding: "32px 40px", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.15)", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, lineHeight: 1.55 };
  if (erro && !d) return <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 16 }}><div style={caixa}><h2>Termo de Responsabilidade</h2><p>{erro}</p></div></div>;
  if (!d) return <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 16 }}><div style={caixa}>Carregando…</div></div>;
  const a = d.assinatura;

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 16 }}>
      <style>{`@media print { body { background:#fff } .nao-imprimir { display:none !important } }`}</style>
      <div style={caixa}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 16 }}>
          <b style={{ fontSize: 18 }}>PHD CONTÁBIL</b>
          <span style={{ fontSize: 12, color: "#555" }}>Termo de Responsabilidade e Uso de Equipamento</span>
        </div>
        <h2 style={{ textAlign: "center", fontSize: 16, margin: "0 0 16px" }}>TERMO DE RESPONSABILIDADE E USO DE EQUIPAMENTO</h2>
        {d.texto.map((p, i) => <p key={i} style={{ margin: "0 0 10px", textAlign: "justify" }}>{p}</p>)}

        {a ? (
          <div style={{ marginTop: 28 }}>
            <p style={{ margin: 0 }}>Assinado eletronicamente em {new Date(a.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.imagem} alt="Assinatura" style={{ height: 90, display: "block", marginTop: 12 }} />
            <div style={{ borderTop: "1px solid #111", width: 340, paddingTop: 4 }}>
              <b>{a.nome}</b><br />CPF {fmtCpf(a.cpf)}
            </div>
            <p style={{ fontSize: 11, color: "#666", marginTop: 16 }}>Código de verificação do texto aceito: {a.hash_texto.slice(0, 16).toUpperCase()}</p>
            <button className="nao-imprimir" onClick={() => window.print()} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 6, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }}>Imprimir / salvar PDF</button>
          </div>
        ) : (
          <div className="nao-imprimir" style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ flex: 2, minWidth: 220 }}>Nome completo<br /><input value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid #bbb", borderRadius: 6 }} /></label>
              <label style={{ flex: 1, minWidth: 160 }}>CPF<br /><input value={cpf} onChange={(e) => setCpf(fmtCpf(e.target.value))} inputMode="numeric" style={{ width: "100%", padding: 8, border: "1px solid #bbb", borderRadius: 6 }} /></label>
            </div>
            <p style={{ margin: "14px 0 4px" }}>Assinatura (desenhe com o mouse ou o dedo):</p>
            <canvas ref={canvas} width={700} height={180} style={{ width: "100%", maxWidth: 700, height: 180, border: "1px dashed #888", borderRadius: 6, touchAction: "none", background: "#fafafa" }} />
            <div><button onClick={limpar} style={{ fontSize: 12, padding: "4px 10px", marginTop: 4, cursor: "pointer" }}>Limpar assinatura</button></div>
            <label style={{ display: "block", marginTop: 14 }}><input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} /> Li e concordo com o Termo de Responsabilidade e Uso de Equipamento.</label>
            {erro && <p style={{ color: "#b91c1c" }}>{erro}</p>}
            <button onClick={assinar} disabled={enviando || !aceite} style={{ marginTop: 14, padding: "10px 20px", borderRadius: 6, border: 0, background: aceite ? "#1d4ed8" : "#9ca3af", color: "#fff", fontWeight: 600, cursor: aceite ? "pointer" : "default" }}>
              {enviando ? "Assinando…" : "Assinar termo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
