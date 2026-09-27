"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CULTURA_ABERTURA, PILARES, VALORES, VALORES_2009, VALORES_INTRO, CULTURA_FECHO, ESTRATEGIA,
  type Pilar,
} from "@/lib/pessoas/cultura";

type Aba = "missao" | "visao" | "valores" | "estrategia" | "cultura";

const ABAS: { id: Aba; nome: string; pergunta: string }[] = [
  { id: "missao", nome: "Missão", pergunta: "Por que existimos?" },
  { id: "visao", nome: "Visão", pergunta: "Onde queremos chegar?" },
  { id: "valores", nome: "Valores", pergunta: "Aquilo em que acreditamos" },
  { id: "estrategia", nome: "Estratégia", pergunta: "O que fazer para chegar lá" },
  { id: "cultura", nome: "Nossa cultura", pergunta: "O que fica de tudo isso" },
];

/**
 * Cultura e Estratégia: missão, visão, valores e planejamento, para explorar.
 *
 * Cada pilar tem a sua mecânica, porque cada um conta uma coisa diferente:
 * Missão e Visão mudaram ao longo do tempo (régua de anos), os Valores têm um
 * lema na frente e um significado atrás (cartões que viram), e a Estratégia
 * são escolhas e metas (frentes, números e perguntas).
 *
 * A aba fica no endereço (#valores, #estrategia...) para dar para mandar o
 * link direto para alguém.
 */
export default function CulturaEstrategia() {
  const [aba, setAba] = useState<Aba>("missao");
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ler = () => {
      const h = window.location.hash.replace("#", "") as Aba;
      if (ABAS.some((a) => a.id === h)) setAba(h);
    };
    ler();
    window.addEventListener("hashchange", ler);
    return () => window.removeEventListener("hashchange", ler);
  }, []);

  const trocar = (a: Aba) => {
    setAba(a);
    // replaceState, e não location.hash: trocar de aba não deve encher o
    // histórico do navegador, nem pular a página até uma âncora.
    window.history.replaceState(null, "", `#${a}`);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const idx = ABAS.findIndex((a) => a.id === aba);

  return (
    <div className="cult">
      <header className="cult-hero">
        <div className="cult-hero-selo mono">{CULTURA_ABERTURA.titulo}</div>
        <h2 className="cult-hero-titulo">{CULTURA_ABERTURA.subtitulo}</h2>
        {CULTURA_ABERTURA.paragrafos.map((p, i) => <p key={i}>{p}</p>)}
      </header>

      <div ref={topo} className="cult-abas" role="tablist" aria-label="Cultura e Estratégia">
        {ABAS.map((a, i) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className={`cult-aba ${aba === a.id ? "on" : ""}`}
            onClick={() => trocar(a.id)}
          >
            <span className="cult-aba-n mono">{String(i + 1).padStart(2, "0")}</span>
            <span className="cult-aba-nome">{a.nome}</span>
            <span className="cult-aba-perg">{a.pergunta}</span>
          </button>
        ))}
      </div>

      <section key={aba} className="cult-painel" role="tabpanel">
        {aba === "missao" && <PilarView pilar={PILARES[0]} />}
        {aba === "visao" && <PilarView pilar={PILARES[1]} />}
        {aba === "valores" && <ValoresView />}
        {aba === "estrategia" && <EstrategiaView />}
        {aba === "cultura" && <CulturaView />}
      </section>

      <div className="cult-rodape">
        {idx > 0 ? (
          <button className="btn" onClick={() => trocar(ABAS[idx - 1].id)}>← {ABAS[idx - 1].nome}</button>
        ) : <span />}
        {idx < ABAS.length - 1 && (
          <button className="btn primary" onClick={() => trocar(ABAS[idx + 1].id)}>
            {ABAS[idx + 1].nome} →
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------- Missão e Visão

function PilarView({ pilar }: { pilar: Pilar }) {
  const ultima = pilar.versoes.length - 1;
  // Abre na versão em vigor: é a que a pessoa precisa saber. A história vem
  // de quem quiser voltar na régua.
  const [sel, setSel] = useState(ultima);
  const v = pilar.versoes[sel];
  const pct = ultima > 0 ? (sel / ultima) * 100 : 100;

  return (
    <div className="pilar">
      <div className="pilar-cab">
        <div className="pilar-nome mono">{pilar.nome}</div>
        <h3 className="pilar-pergunta">{pilar.pergunta}</h3>
        {pilar.explica.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className="evol" role="group" aria-label={`Versões da ${pilar.nome}`}>
        <div className="evol-trilho"><span style={{ width: `${pct}%` }} /></div>
        {pilar.versoes.map((x, i) => (
          <button
            key={x.ano}
            className={`evol-no ${i === sel ? "on" : ""} ${i < sel ? "passou" : ""}`}
            style={{ left: `${ultima > 0 ? (i / ultima) * 100 : 50}%` }}
            onClick={() => setSel(i)}
            aria-pressed={i === sel}
          >
            <span className="evol-bola" />
            <span className="evol-ano mono">{x.ano}</span>
            <span className="evol-fase">{x.fase}</span>
          </button>
        ))}
      </div>

      <article key={v.ano} className="declara">
        <div className="declara-topo">
          <span className="declara-ano">{v.ano}</span>
          <span className="declara-fase">{v.fase}</span>
          {sel === ultima && <span className="declara-vigor mono">Em vigor</span>}
        </div>
        <blockquote className="declara-texto">{v.declaracao}</blockquote>
        <div className="declara-leitura">
          {v.leitura.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="declara-nav">
          <button className="btn" disabled={sel === 0} onClick={() => setSel(sel - 1)}>← Versão anterior</button>
          <span className="mono">{sel + 1} de {pilar.versoes.length}</span>
          <button className="btn" disabled={sel === ultima} onClick={() => setSel(sel + 1)}>Próxima versão →</button>
        </div>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------- Valores

function ValoresView() {
  const [virados, setVirados] = useState<Set<number>>(new Set());
  const todos = virados.size === VALORES.length;

  const virar = (i: number) => {
    setVirados((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  return (
    <div className="valores">
      <div className="pilar-cab">
        <div className="pilar-nome mono">Valores</div>
        <h3 className="pilar-pergunta">Aquilo em que acreditamos</h3>
        {VALORES_INTRO.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className="val-origem">
        <div className="val-origem-rot mono">2009 · os primeiros valores</div>
        <div className="val-origem-chips">
          {VALORES_2009.map((v) => <span key={v} className="val-chip">{v}</span>)}
        </div>
        <div className="val-origem-seta" aria-hidden="true">
          <span className="mono">a partir de 2011, com significado</span>
        </div>
      </div>

      <div className="val-acoes">
        <span className="desc">Toque num valor para ver o que ele significa para a PHD.</span>
        <button
          className="btn"
          onClick={() => setVirados(todos ? new Set() : new Set(VALORES.map((_, i) => i)))}
        >
          {todos ? "Desvirar todos" : "Virar todos"}
        </button>
      </div>

      <div className="val-grade">
        {VALORES.map((v, i) => (
          <button
            key={v.nome}
            className={`val-carta ${virados.has(i) ? "virada" : ""}`}
            onClick={() => virar(i)}
            aria-pressed={virados.has(i)}
            aria-label={`${v.nome}: ${virados.has(i) ? "ver o lema" : "ver o significado"}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="val-miolo">
              <span className="val-face val-frente">
                <span className="val-letra" aria-hidden="true">{v.nome[0]}</span>
                <span className="val-nome">{v.nome}</span>
                <span className="val-lema">
                  {v.autor ? `“${v.lema}”` : v.lema}
                  {v.autor && <em> — {v.autor}</em>}
                </span>
                <span className="val-dica mono">ver significado ↻</span>
              </span>
              <span className="val-face val-verso">
                <span className="val-nome">{v.nome}</span>
                {v.significado.map((p, j) => <span key={j} className="val-sig">{p}</span>)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Estratégia

function EstrategiaView() {
  const eras = ESTRATEGIA.eras;
  const [era, setEra] = useState(eras.length - 1);
  const [escolha, setEscolha] = useState<number | null>(2);
  const e = eras[era];

  return (
    <div className="estr">
      <div className="pilar-cab">
        <div className="pilar-nome mono">{ESTRATEGIA.titulo}</div>
        <h3 className="pilar-pergunta">{ESTRATEGIA.subtitulo}</h3>
        {ESTRATEGIA.intro.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className="estr-eras" role="tablist" aria-label="Fases do planejamento">
        {eras.map((x, i) => (
          <button
            key={x.ano}
            role="tab"
            aria-selected={i === era}
            className={`estr-era ${i === era ? "on" : ""}`}
            onClick={() => setEra(i)}
          >
            <span className="mono">{x.ano}</span>
            <strong>{x.frase}</strong>
          </button>
        ))}
      </div>

      <article key={e.ano} className="estr-fase">
        <div className="estr-frase">
          <span className="mono">{e.ano}</span>
          <h4>{e.frase}</h4>
        </div>
        {e.texto.map((p, i) => <p key={i}>{p}</p>)}

        {e.metas && (
          <div className="estr-metas">
            {e.metas.map((m) => (
              <div key={m.rotulo} className="estr-meta">
                <Contador valor={m.valor} />
                <span>{m.rotulo}</span>
              </div>
            ))}
          </div>
        )}

        {e.frentes && (
          <>
            <div className="section-label mono">Três frentes para sustentar o crescimento</div>
            <ol className="estr-frentes">
              {e.frentes.map((f, i) => (
                <li key={i} style={{ animationDelay: `${150 + i * 120}ms` }}>
                  <span className="estr-frente-n">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </article>

      <h3 className="cult-sec">Estratégia é fazer escolhas</h3>
      <p className="cult-sec-sub">Uma estratégia pode ser resumida em três perguntas.</p>
      <div className="estr-escolhas">
        {ESTRATEGIA.escolhas.map((x, i) => (
          <button
            key={x.nome}
            className={`estr-escolha ${escolha === i ? "on" : ""}`}
            onClick={() => setEscolha(escolha === i ? null : i)}
            aria-expanded={escolha === i}
          >
            <span className="estr-escolha-nome">{x.nome}</span>
            <span className="estr-escolha-perg">{x.pergunta}</span>
            {x.destaque && escolha === i && <span className="estr-escolha-dest">{x.destaque}</span>}
          </button>
        ))}
      </div>

      <div className="estr-temas">
        {ESTRATEGIA.temas.map((t) => (
          <details key={t.titulo} className="estr-tema">
            <summary>
              <span>{t.titulo}</span>
              <span className="estr-tema-mais" aria-hidden="true">+</span>
            </summary>
            <div className="estr-tema-corpo">
              {t.texto.map((p, i) => <p key={i}>{p}</p>)}
              {t.citacao && <blockquote className="ct-citacao">{t.citacao}</blockquote>}
              {t.nota && <p className="desc">{t.nota}</p>}
            </div>
          </details>
        ))}
      </div>

      <div className="estr-fecho">
        <p>{ESTRATEGIA.fecho.texto}</p>
        <Revela className="estr-onde">
          {ESTRATEGIA.fecho.onde.map((o, i) => (
            <span key={o} style={{ transitionDelay: `${i * 110}ms` }}>{o}</span>
          ))}
        </Revela>
        <p className="estr-fecho-final">{ESTRATEGIA.fecho.final}</p>
      </div>
    </div>
  );
}

// --------------------------------------------------------- Nossa cultura

function CulturaView() {
  const f = CULTURA_FECHO;
  return (
    <div className="cfecho">
      <div className="pilar-cab">
        <div className="pilar-nome mono">Nossa cultura</div>
        <h3 className="pilar-pergunta">{f.titulo}</h3>
        {f.paragrafos.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <Revela className="cfecho-mudou">
        {f.mudancas.map((m, i) => (
          <span key={m} style={{ transitionDelay: `${i * 140}ms` }}>{m}</span>
        ))}
      </Revela>
      <Revela className="cfecho-permanece">
        <p>{f.permanece}</p>
      </Revela>

      <div className="cfecho-def">
        <div className="mono">Cultura organizacional não é aquilo que está escrito.</div>
        <h3>{f.definicao}</h3>
      </div>

      <ol className="cfecho-gestos">
        {f.gestos.map((g) => (
          <Revela key={g} as="li" className="cfecho-gesto">{g}</Revela>
        ))}
      </ol>

      <p className="cfecho-final">{f.final}</p>

      <figure className="cfecho-schein">
        <blockquote>{f.schein}</blockquote>
        <figcaption>Edgar Schein, um dos autores mais respeitados em cultura organizacional</figcaption>
      </figure>
    </div>
  );
}

// ------------------------------------------------------------- utilitários

/**
 * Aparece quando entra na tela.
 *
 * Sem IntersectionObserver (navegador antigo) ou com movimento reduzido, o
 * conteúdo já nasce visível: o efeito é enfeite, o texto não pode depender dele.
 */
function Revela({
  children, className = "", as = "div",
}: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined"
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisivel(true);
      return;
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisivel(true); obs.disconnect(); }
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cls = `revela ${visivel ? "visivel" : ""} ${className}`;
  if (as === "li") return <li ref={(n) => { ref.current = n; }} className={cls}>{children}</li>;
  return <div ref={(n) => { ref.current = n; }} className={cls}>{children}</div>;
}

/** Número que sobe de zero até o valor quando aparece ("20%", "35%"). */
function Contador({ valor }: { valor: string }) {
  const m = /^(\d+)(.*)$/.exec(valor);
  const alvo = m ? Number(m[1]) : 0;
  const sufixo = m ? m[2] : "";
  const [n, setN] = useState(m ? 0 : alvo);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(alvo); return; }
    let raf = 0;
    const inicio = performance.now();
    const dur = 1100;
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / dur);
      // ease-out: sobe rápido e assenta no valor, como um contador de verdade.
      setN(Math.round(alvo * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  return <span ref={ref} className="estr-meta-num">{m ? `${n}${sufixo}` : valor}</span>;
}
