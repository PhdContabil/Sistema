"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blocosDoTexto } from "@/lib/pessoas/conteudo-formato";
import { paginasDoLivro, rotuloDaPagina, limitar, type Pagina } from "@/lib/pessoas/historia-livro";
import { TEXTO_HISTORIA } from "@/lib/pessoas/sobre-nos";
import Blocos from "./Blocos";

/** Tempo da virada. Igual ao da animação em globals.css (.livro-folha). */
const VIRADA_MS = 850;

type Direcao = "prox" | "ant";

/**
 * A História da PHD como um livro de folhear.
 *
 * Em tela larga, cada abertura tem duas páginas: à esquerda o ano e a chamada
 * do capítulo, à direita o texto. Virar a página é uma folha de verdade
 * girando na lombada — a frente é a página que sai, o verso é a que chega.
 * Em tela estreita não cabe abertura dupla: vira uma página só, que desliza.
 *
 * O texto continua em sobre-nos.ts; cada marco `@ ano | chamada` é um capítulo.
 */
export default function LivroHistoria() {
  const paginas = useMemo(
    () => paginasDoLivro(blocosDoTexto(TEXTO_HISTORIA), {
      tituloCapa: "A História da PHD Contábil",
      subtituloCapa: "Uma história construída por pessoas",
    }),
    []
  );
  const total = paginas.length;
  const capitulos = paginas.filter((p) => p.tipo === "capitulo").length;

  const [atual, setAtual] = useState(0);
  // Virada em curso: de onde para onde. Enquanto existe, a navegação espera.
  const [virada, setVirada] = useState<{ de: number; para: number; dir: Direcao } | null>(null);
  const [umaPagina, setUmaPagina] = useState(false);
  const [semAnimacao, setSemAnimacao] = useState(false);
  // Em página única não há folha girando: a página nova só entra deslizando,
  // e o lado de onde ela vem é esta direção.
  const [entrada, setEntrada] = useState<Direcao | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const toque = useRef<number | null>(null);

  useEffect(() => {
    const estreita = window.matchMedia("(max-width: 820px)");
    const calma = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ler = () => { setUmaPagina(estreita.matches); setSemAnimacao(calma.matches); };
    ler();
    estreita.addEventListener("change", ler);
    calma.addEventListener("change", ler);
    return () => {
      estreita.removeEventListener("change", ler);
      calma.removeEventListener("change", ler);
    };
  }, []);

  const irPara = useCallback((destino: number) => {
    const para = limitar(destino, total);
    if (virada || para === atual) return;
    const dir: Direcao = para > atual ? "prox" : "ant";

    // Salto de vários capítulos pela régua, ou quem pediu menos movimento:
    // troca direto. Uma folha só girando para pular dez anos pareceria defeito.
    if (semAnimacao || Math.abs(para - atual) > 1) {
      setEntrada(null);
      setAtual(para);
      return;
    }
    if (umaPagina) {
      setEntrada(dir);
      setAtual(para);
      return;
    }
    setVirada({ de: atual, para, dir });
  }, [atual, total, virada, semAnimacao, umaPagina]);

  // A virada termina por tempo, não por `animationend`: se a aba perde o foco
  // no meio, o navegador pode nunca disparar o evento e o livro travaria.
  useEffect(() => {
    if (!virada) return;
    const t = setTimeout(() => { setAtual(virada.para); setVirada(null); }, VIRADA_MS);
    return () => clearTimeout(t);
  }, [virada]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); irPara(atual + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); irPara(atual - 1); }
      else if (e.key === "Home") { e.preventDefault(); irPara(0); }
      else if (e.key === "End") { e.preventDefault(); irPara(total - 1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [atual, total, irPara]);

  const inicioToque = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") toque.current = e.clientX;
  };
  const fimToque = (e: React.PointerEvent) => {
    if (toque.current === null) return;
    const dx = e.clientX - toque.current;
    toque.current = null;
    // 50 px: menos que isso é rolagem do texto torta, não intenção de virar.
    if (dx < -50) irPara(atual + 1);
    else if (dx > 50) irPara(atual - 1);
  };

  const pagina = paginas[atual];
  const progresso = total > 1 ? (atual / (total - 1)) * 100 : 100;

  return (
    <div className="livro-wrap" ref={raiz}>
      <div
        className={`livro ${umaPagina ? "uma" : "dupla"} ${atual === 0 && !virada ? "fechado" : ""}`}
        onPointerDown={inicioToque}
        onPointerUp={fimToque}
        aria-roledescription="livro"
        aria-label="A História da PHD Contábil"
      >
        {umaPagina ? (
          <PaginaUnica
            key={atual}
            p={pagina}
            i={atual}
            capitulos={capitulos}
            entrada={entrada}
          />
        ) : (
          <Abertura
            paginas={paginas}
            atual={atual}
            virada={virada}
            capitulos={capitulos}
          />
        )}

        {/* Cantos dobrados: o convite para virar, onde o polegar iria num livro. */}
        {atual > 0 && (
          <button className="livro-canto esq" onClick={() => irPara(atual - 1)} aria-label="Página anterior">
            <span aria-hidden="true">‹</span>
          </button>
        )}
        {atual < total - 1 && (
          <button className="livro-canto dir" onClick={() => irPara(atual + 1)} aria-label="Próxima página">
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>

      <div className="livro-controles">
        <button className="btn" onClick={() => irPara(atual - 1)} disabled={atual === 0 || !!virada}>
          ← Anterior
        </button>
        <div className="livro-folio mono" aria-live="polite">
          {pagina.tipo === "capitulo" ? `${pagina.ano}` : rotuloDaPagina(pagina)}
          <span> · página {atual + 1} de {total}</span>
        </div>
        <button className="btn primary" onClick={() => irPara(atual + 1)} disabled={atual === total - 1 || !!virada}>
          {atual === 0 ? "Abrir o livro →" : "Próxima →"}
        </button>
      </div>

      {/* Régua dos anos: a linha do tempo inteira à mão, para quem quer ir direto a 2020. */}
      <nav className="livro-regua" aria-label="Capítulos">
        <div className="livro-regua-trilho"><span style={{ width: `${progresso}%` }} /></div>
        <ol>
          {paginas.map((p, i) => (
            <li key={i}>
              <button
                className={i === atual ? "on" : i < atual ? "lida" : ""}
                onClick={() => irPara(i)}
                aria-current={i === atual ? "page" : undefined}
                title={p.tipo === "capitulo" ? `${p.ano} — ${p.titulo}` : p.titulo}
              >
                <span className="ponto" />
                <span className="rot mono">{rotuloDaPagina(p)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <p className="livro-dica">Use as setas do teclado, os cantos da página ou arraste para o lado.</p>
    </div>
  );
}

// ------------------------------------------------------------- abertura dupla

function Abertura({
  paginas, atual, virada, capitulos,
}: {
  paginas: Pagina[];
  atual: number;
  virada: { de: number; para: number; dir: Direcao } | null;
  capitulos: number;
}) {
  // Durante a virada, o que fica parado embaixo da folha já é metade do destino:
  //  - para frente: esquerda de onde saí, direita de onde chego;
  //  - para trás:   esquerda de onde chego, direita de onde saí.
  let esq = atual;
  let dir = atual;
  if (virada?.dir === "prox") { esq = virada.de; dir = virada.para; }
  if (virada?.dir === "ant") { esq = virada.para; dir = virada.de; }

  return (
    <div className="livro-abertura">
      <div className="livro-pg esq"><FaceEsquerda p={paginas[esq]} i={esq} capitulos={capitulos} /></div>
      <div className="livro-lombada" aria-hidden="true" />
      <div className="livro-pg dir"><FaceDireita p={paginas[dir]} i={dir} /></div>

      {virada && (
        <div className={`livro-folha ${virada.dir}`} aria-hidden="true">
          {virada.dir === "prox" ? (
            <>
              <div className="face frente livro-pg dir"><FaceDireita p={paginas[virada.de]} i={virada.de} /></div>
              <div className="face verso livro-pg esq"><FaceEsquerda p={paginas[virada.para]} i={virada.para} capitulos={capitulos} /></div>
            </>
          ) : (
            <>
              <div className="face frente livro-pg esq"><FaceEsquerda p={paginas[virada.de]} i={virada.de} capitulos={capitulos} /></div>
              <div className="face verso livro-pg dir"><FaceDireita p={paginas[virada.para]} i={virada.para} /></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- uma página

function PaginaUnica({
  p, i, capitulos, entrada,
}: { p: Pagina; i: number; capitulos: number; entrada: Direcao | null }) {
  return (
    <div className={`livro-unica ${entrada ? `entra-${entrada}` : ""}`}>
      <div className="livro-pg esq"><FaceEsquerda p={p} i={i} capitulos={capitulos} /></div>
      {p.tipo !== "capa" && <div className="livro-pg dir"><FaceDireita p={p} i={i} /></div>}
    </div>
  );
}

// ----------------------------------------------------------------- as faces

function numeroDoCapitulo(p: Pagina, i: number): number {
  // Capa e prólogo vêm antes: o primeiro capítulo é a página 2.
  return p.tipo === "capitulo" ? i - 1 : 0;
}

function FaceEsquerda({ p, i, capitulos }: { p: Pagina; i: number; capitulos: number }) {
  if (p.tipo === "capa") {
    return (
      <div className="lv-capa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lv-capa-logo" src="/pessoas/identidade/logo-2026-contabil.png" alt="PHD Contábil" />
        <h2 className="lv-capa-titulo">{p.titulo}</h2>
        <p className="lv-capa-sub">Uma história construída por pessoas</p>
        <div className="lv-capa-rodape mono">Taboão da Serra · desde 30 de novembro de 2009</div>
      </div>
    );
  }

  if (p.tipo === "capitulo") {
    const n = numeroDoCapitulo(p, i);
    return (
      <div className="lv-abre">
        <div className="lv-abre-cap mono">Capítulo {n} de {capitulos}</div>
        <div className="lv-abre-ano">{p.ano}</div>
        <div className="lv-abre-fio" />
        <h2 className="lv-abre-titulo">{p.titulo}</h2>
        <div className="lv-numero mono">{i * 2}</div>
      </div>
    );
  }

  return (
    <div className="lv-abre">
      <div className="lv-abre-cap mono">{p.tipo === "prologo" ? "Prólogo" : "Epílogo"}</div>
      <div className="lv-abre-ano lv-abre-ano-texto">{p.tipo === "prologo" ? "Antes de tudo" : p.titulo}</div>
      <div className="lv-abre-fio" />
      {p.tipo === "prologo" && <h2 className="lv-abre-titulo">{p.titulo}</h2>}
      <div className="lv-numero mono">{i * 2}</div>
    </div>
  );
}

function FaceDireita({ p, i }: { p: Pagina; i: number }) {
  if (p.tipo === "capa") {
    return (
      <div className="lv-guarda">
        <p className="lv-guarda-frase">
          Toda empresa começa com uma ideia.
          <br />
          Mas nem toda ideia se transforma em uma história.
        </p>
        <div className="lv-guarda-convite mono">Vire a página →</div>
      </div>
    );
  }
  return (
    <div className={`lv-texto conteudo ${p.tipo === "capitulo" ? "capitular" : ""}`}>
      <Blocos blocos={p.blocos} alt={p.titulo} />
      <div className="lv-numero mono">{i * 2 + 1}</div>
    </div>
  );
}
