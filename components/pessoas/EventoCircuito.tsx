"use client";

import { useCallback, useEffect, useState } from "react";

// 1º Circuito PHD Viva com Saúde. Slides 1–4 vêm do PowerPoint (imagens); o
// slide 5 é a própria tela de inscrição, com a lista de quem já entrou.

const EVENTO = "circuito-viva-saude-2026";
const BASE = "/pessoas/eventos/circuito-viva-saude";
const PDF = `${BASE}/circuito-phd-viva-com-saude.pdf`;
const SLIDES = [
  { src: `${BASE}/slide-1.jpg`, alt: "1º Circuito PHD Viva com Saúde — 07 de novembro, Parque Villa-Lobos, 3, 5 e 10 km" },
  { src: `${BASE}/slide-2.jpg`, alt: "Um convite para cuidar: movimento, prevenção e integração. Escolha seu ritmo: 3 km caminhada, 5 km e 10 km corrida" },
  { src: `${BASE}/slide-3.jpg`, alt: "Programação do dia: das 06:30 (chegada) às 11:30 (foto oficial e encerramento)" },
  { src: `${BASE}/slide-4.jpg`, alt: "Kit da ação: camiseta, squeeze, ecobag e medalha" },
];
const TOTAL = SLIDES.length + 1;

const MODALIDADES = [
  { id: "3km", titulo: "3 km", sub: "Caminhada em família", cor: "#d6336c" },
  { id: "5km", titulo: "5 km", sub: "Corrida", cor: "#0b6aa8" },
  { id: "10km", titulo: "10 km", sub: "Corrida", cor: "#123a6b" },
];

interface Inscrito {
  nome: string; setor: string | null; modalidade: string; acompanhantes: number; criado_em: string; minha: boolean;
}

function iniciais(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function EventoCircuito() {
  const [i, setI] = useState(0);
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);
  const [minha, setMinha] = useState<Inscrito | null>(null);
  const [modalidade, setModalidade] = useState("");
  const [acomp, setAcomp] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [carregado, setCarregado] = useState(false);

  const aplicar = useCallback((j: { inscritos?: Inscrito[]; minha?: Inscrito | null }) => {
    setInscritos(j.inscritos ?? []);
    setMinha(j.minha ?? null);
    if (j.minha) { setModalidade(j.minha.modalidade); setAcomp(j.minha.acompanhantes); }
  }, []);

  useEffect(() => {
    fetch(`/api/pessoas/eventos/${EVENTO}/inscricoes`, { cache: "no-store" })
      .then((r) => r.json()).then(aplicar).catch(() => {}).finally(() => setCarregado(true));
  }, [aplicar]);

  const ir = useCallback((n: number) => setI(Math.max(0, Math.min(TOTAL - 1, n))), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "SELECT", "TEXTAREA"].includes(alvo.tagName)) return;
      if (e.key === "ArrowRight") ir(i + 1);
      if (e.key === "ArrowLeft") ir(i - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, ir]);

  async function enviar(metodo: "POST" | "DELETE") {
    if (metodo === "POST" && !modalidade) { setMsg({ tipo: "erro", texto: "Escolha o circuito." }); return; }
    if (metodo === "DELETE" && !window.confirm("Cancelar a sua inscrição?")) return;
    setSalvando(true); setMsg(null);
    try {
      const r = await fetch(`/api/pessoas/eventos/${EVENTO}/inscricoes`, {
        method: metodo, headers: { "Content-Type": "application/json" },
        body: metodo === "POST" ? JSON.stringify({ modalidade, acompanhantes: acomp }) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ tipo: "erro", texto: j.error ?? `Falha (HTTP ${r.status}).` }); return; }
      const antes = !!minha;
      aplicar(j);
      if (metodo === "DELETE") { setModalidade(""); setAcomp(0); setMsg({ tipo: "ok", texto: "Inscrição cancelada." }); }
      else setMsg({ tipo: "ok", texto: antes ? "Inscrição atualizada." : "Inscrição feita! Nos vemos no Villa-Lobos." });
    } catch {
      setMsg({ tipo: "erro", texto: "Falha de rede." });
    } finally {
      setSalvando(false);
    }
  }

  const pessoas = inscritos.length + inscritos.reduce((s, x) => s + x.acompanhantes, 0);
  const porMod = (m: string) => inscritos.filter((x) => x.modalidade === m).length;

  return (
    <div className="evc">
      <div className="evc-topo">
        <div className="evc-chips">
          <span className="evc-chip rosa">Outubro Rosa • Novembro Azul</span>
          <span className="evc-chip">Sáb, 07/11 · 06:30–11:30</span>
          <span className="evc-chip">Parque Villa-Lobos</span>
        </div>
        <div className="evc-acoes">
          <button className="btn" onClick={() => ir(TOTAL - 1)}>Inscrever-se</button>
          <a className="btn" href={PDF} download>Baixar em PDF</a>
        </div>
      </div>

      <div className="evc-palco">
        <button className="evc-seta esq" onClick={() => ir(i - 1)} disabled={i === 0} aria-label="Slide anterior">‹</button>
        <div className="evc-quadro">
          {i < SLIDES.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} className="evc-img" src={SLIDES[i].src} alt={SLIDES[i].alt} />
          ) : (
            <div className="evc-insc">
              <div className="evc-insc-txt">
                <p className="evc-frase">O primeiro passo da caminhada não começa no parque. <strong>Começa aqui.</strong></p>
                <p className="evc-frase2">Cuidado também é decisão. Inscreva-se, convide quem você ama e deixe o caminho começar.</p>

                <div className="evc-label">Circuito desejado</div>
                <div className="evc-mods">
                  {MODALIDADES.map((m) => (
                    <button key={m.id} type="button" className={`evc-mod${modalidade === m.id ? " sel" : ""}`}
                            style={{ ["--c" as string]: m.cor }} onClick={() => setModalidade(m.id)}>
                      <strong>{m.titulo}</strong><span>{m.sub}</span>
                    </button>
                  ))}
                </div>

                <label className="evc-label" htmlFor="evc-acomp">Familiares que vão com você</label>
                <div className="evc-acomp">
                  <button type="button" className="btn" onClick={() => setAcomp(Math.max(0, acomp - 1))} aria-label="Menos">−</button>
                  <input id="evc-acomp" type="number" min={0} max={10} value={acomp}
                         onChange={(e) => setAcomp(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                  <button type="button" className="btn" onClick={() => setAcomp(Math.min(10, acomp + 1))} aria-label="Mais">+</button>
                </div>

                {msg && <div className={`banner ${msg.tipo === "ok" ? "ok" : "error"}`}>{msg.texto}</div>}
                <div className="evc-botoes">
                  <button className="btn primary" disabled={salvando || !carregado} onClick={() => enviar("POST")}>
                    {salvando ? "Salvando…" : minha ? "Atualizar inscrição" : "Quero participar"}
                  </button>
                  {minha && <button className="btn" disabled={salvando} onClick={() => enviar("DELETE")}>Cancelar inscrição</button>}
                </div>
              </div>

              <div className="evc-lista">
                <div className="evc-lista-head">
                  <strong>Já inscritos</strong>
                  <span>{inscritos.length} {inscritos.length === 1 ? "colaborador" : "colaboradores"} · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} no total</span>
                </div>
                <div className="evc-placar">
                  {MODALIDADES.map((m) => (
                    <div key={m.id} style={{ ["--c" as string]: m.cor }}><strong>{porMod(m.id)}</strong><span>{m.titulo}</span></div>
                  ))}
                </div>
                {!carregado ? <p className="evc-vazio">Carregando…</p>
                  : inscritos.length === 0 ? <p className="evc-vazio">Seja a primeira pessoa a se inscrever!</p>
                  : (
                    <ul>
                      {inscritos.map((x, k) => {
                        const m = MODALIDADES.find((mm) => mm.id === x.modalidade);
                        return (
                          <li key={k} className={x.minha ? "eu" : ""}>
                            <span className="evc-av" style={{ background: m?.cor }}>{iniciais(x.nome)}</span>
                            <span className="evc-nome">{x.nome}{x.minha ? " (você)" : ""}<small>{x.setor ?? ""}{x.acompanhantes > 0 ? `${x.setor ? " · " : ""}+${x.acompanhantes} familiar${x.acompanhantes > 1 ? "es" : ""}` : ""}</small></span>
                            <span className="evc-tag" style={{ background: m?.cor }}>{m?.titulo ?? x.modalidade}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
              </div>
            </div>
          )}
        </div>
        <button className="evc-seta dir" onClick={() => ir(i + 1)} disabled={i === TOTAL - 1} aria-label="Próximo slide">›</button>
      </div>

      <div className="evc-dots">
        {Array.from({ length: TOTAL }).map((_, k) => (
          <button key={k} className={k === i ? "on" : ""} onClick={() => ir(k)}
                  aria-label={k === TOTAL - 1 ? "Inscrição" : `Slide ${k + 1}`} />
        ))}
        <span className="evc-cont">{i === TOTAL - 1 ? "Inscrição" : `${i + 1} de ${TOTAL}`}</span>
      </div>
    </div>
  );
}
