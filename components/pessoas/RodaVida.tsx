"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DIMENSOES, DIMENSAO_POR_ID, ESCALA, PERGUNTA_REFLEXAO, FRASE_FINAL,
  DIMENSOES_PARA_ESCOLHER,
} from "@/lib/roda-vida-conteudo";
import {
  pontosDaRoda, media, respondidas, completa, maisBaixas,
  poligono, vertice, comparar, corDaNota, progressoAcoes,
  type Notas, type PontoRoda,
} from "@/lib/roda-vida-calculo";
import { formatDataHora } from "@/lib/datas";

interface Acao {
  id: string;
  dimensao: string;
  acao: string;
  feita: boolean;
  feita_em: string | null;
}

interface Roda {
  id: string;
  email: string;
  criada_em: string;
  concluida_em: string | null;
  reflexao: string | null;
  notas: Notas;
  acoes: Acao[];
}

type Etapa = "notas" | "roda" | "acoes";

export default function RodaVida({
  rodaInicial, historicoInicial, meuEmail, souDiretoria,
}: {
  rodaInicial: Roda | null;
  historicoInicial: Roda[];
  meuEmail: string | null;
  souDiretoria: boolean;
}) {
  const [roda, setRoda] = useState<Roda | null>(rodaInicial);
  const [historico, setHistorico] = useState<Roda[]>(historicoInicial);
  const [etapa, setEtapa] = useState<Etapa>(() =>
    rodaInicial?.concluida_em ? "acoes" : "notas"
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reflexao, setReflexao] = useState(rodaInicial?.reflexao ?? "");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/roda-vida", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setRoda(j.roda);
      setHistorico(j.historico ?? []);
      if (j.roda?.reflexao !== undefined) setReflexao(j.roda?.reflexao ?? "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  async function chamar(url: string, init: RequestInit): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
      return true;
    } catch {
      setErro("Falha de rede.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  const notas = roda?.notas ?? {};
  const quantas = respondidas(notas, DIMENSOES);
  const fechada = completa(notas, DIMENSOES);
  const concluida = !!roda?.concluida_em;

  // A roda anterior é a concluída mais recente que não seja esta.
  const anterior = useMemo(
    () => historico.find((h) => h.id !== roda?.id) ?? null,
    [historico, roda?.id]
  );

  const pontos = useMemo(
    () => pontosDaRoda(notas, DIMENSOES, anterior?.notas ?? null),
    [notas, anterior]
  );

  async function comecar() {
    if (!(await chamar("/api/roda-vida", { method: "POST" }))) return;
    await recarregar();
    setEtapa("notas");
  }

  async function darNota(dimensao: string, nota: number) {
    if (!roda) return;
    // Otimista: clicar numa nota precisa responder na hora.
    setRoda((r) => (r ? { ...r, notas: { ...r.notas, [dimensao]: nota } } : r));
    await chamar("/api/roda-vida/notas", {
      method: "PUT",
      body: JSON.stringify({ roda_id: roda.id, dimensao, nota }),
    });
  }

  async function concluir() {
    if (!roda) return;
    if (!(await chamar("/api/roda-vida", {
      method: "PATCH",
      body: JSON.stringify({ id: roda.id, acao: "concluir", reflexao }),
    }))) return;
    await recarregar();
    setEtapa("acoes");
    setAviso("Roda fechada. Agora escolha o que quer cuidar.");
  }

  async function reabrir() {
    if (!roda) return;
    if (!(await chamar("/api/roda-vida", {
      method: "PATCH", body: JSON.stringify({ id: roda.id, acao: "reabrir" }),
    }))) return;
    await recarregar();
    setEtapa("notas");
  }

  async function guardarReflexao() {
    if (!roda) return;
    if (reflexao === (roda.reflexao ?? "")) return;
    if (await chamar("/api/roda-vida", {
      method: "PATCH", body: JSON.stringify({ id: roda.id, reflexao }),
    })) {
      setRoda((r) => (r ? { ...r, reflexao } : r));
    }
  }

  async function escolherAcao(dimensao: string, acao: string) {
    if (!roda) return;
    if (await chamar("/api/roda-vida/acoes", {
      method: "POST", body: JSON.stringify({ roda_id: roda.id, dimensao, acao }),
    })) recarregar();
  }

  async function marcar(id: string, feita: boolean) {
    if (!roda) return;
    setRoda((r) => (r ? { ...r, acoes: r.acoes.map((a) => (a.id === id ? { ...a, feita } : a)) } : r));
    await chamar("/api/roda-vida/acoes", {
      method: "PATCH", body: JSON.stringify({ roda_id: roda.id, id, feita }),
    });
    recarregar();
  }

  async function tirarAcao(id: string) {
    if (!roda) return;
    if (await chamar(`/api/roda-vida/acoes?id=${id}&roda_id=${roda.id}`, { method: "DELETE" })) {
      recarregar();
    }
  }

  // ------------------------------------------------------------ sem roda

  if (!roda) {
    return (
      <div className="rv-abertura">
        <AvisoPrivacidade souDiretoria={souDiretoria} />
        <div className="card rv-convite">
          <h2>Como está a sua vida hoje?</h2>
          <p>
            São {DIMENSOES.length} dimensões. Para cada uma, algumas perguntas para pensar e
            uma nota de {ESCALA.min} a {ESCALA.max}. No fim, a sua roda aparece — e você
            escolhe o que quer cuidar primeiro.
          </p>
          <p className="rv-escala">
            <strong>{ESCALA.min}</strong> = {ESCALA.legendaMin} · <strong>{ESCALA.max}</strong> = {ESCALA.legendaMax}
          </p>
          <button className="btn primary" disabled={salvando} onClick={comecar}>
            Começar minha roda
          </button>
          {erro && <p className="rv-erro">{erro}</p>}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ com roda

  return (
    <div className="rv">
      {erro && <div className="rv-erro">{erro}</div>}
      {aviso && <div className="rv-aviso-ok">{aviso}</div>}

      <AvisoPrivacidade souDiretoria={souDiretoria} />

      <div className="rv-abas">
        <button className={`chip ${etapa === "notas" ? "on" : ""}`} onClick={() => setEtapa("notas")}>
          1. Refletir e pontuar {quantas < DIMENSOES.length && `(${quantas}/${DIMENSOES.length})`}
        </button>
        <button className={`chip ${etapa === "roda" ? "on" : ""}`} onClick={() => setEtapa("roda")}>
          2. Minha roda
        </button>
        <button className={`chip ${etapa === "acoes" ? "on" : ""}`} onClick={() => setEtapa("acoes")}>
          3. Da reflexão à ação {roda.acoes.length > 0 && `(${roda.acoes.length})`}
        </button>

        <span className="rv-estado">
          {concluida
            ? `Fechada em ${formatDataHora(roda.concluida_em!)}`
            : "Rascunho — só você está vendo"}
        </span>
      </div>

      {/* ---------------------------------------------------- 1. notas --- */}
      {etapa === "notas" && (
        <div className="rv-notas">
          {concluida && (
            <p className="rv-nota-info">
              Esta roda já foi fechada. Para mudar uma nota,{" "}
              <button className="rv-link" onClick={reabrir} disabled={salvando}>reabra</button> antes.
            </p>
          )}

          {DIMENSOES.map((d) => (
            <div key={d.id} className="card rv-dim">
              <div className="rv-dim-topo">
                <h3>
                  <span className="rv-emoji">{d.emoji}</span> {d.nome}
                </h3>
                <button className="rv-link" onClick={() => setAbertas((s) => {
                  const n = new Set(s);
                  if (n.has(d.id)) n.delete(d.id); else n.add(d.id);
                  return n;
                })}>
                  {abertas.has(d.id) ? "esconder perguntas" : `${d.perguntas.length} perguntas`}
                </button>
              </div>

              {abertas.has(d.id) && (
                <ul className="rv-perguntas">
                  {d.perguntas.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}

              <div className="rv-escala-btns">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    className={`rv-n ${notas[d.id] === n ? "on" : ""}`}
                    style={notas[d.id] === n ? { background: corDaNota(n), borderColor: corDaNota(n) } : undefined}
                    disabled={salvando || concluida}
                    onClick={() => darNota(d.id, n)}
                    aria-label={`Nota ${n} para ${d.nome}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="rv-rodape">
            <span>
              {quantas} de {DIMENSOES.length} respondidas
              {fechada ? " — pode fechar a roda." : "."}
            </span>
            <button className="btn primary" disabled={!fechada || salvando || concluida}
                    onClick={() => setEtapa("roda")}>
              Ver minha roda
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- 2. roda --- */}
      {etapa === "roda" && (
        <div className="rv-resultado">
          <div className="rv-grafico">
            <GraficoRoda pontos={pontos} mostrarAnterior={!!anterior} />
            <div className="rv-media">
              <span className="k">Média da roda</span>
              <span className="v" style={{ color: corDaNota(media(notas, DIMENSOES)) }}>
                {media(notas, DIMENSOES).toFixed(1)}
              </span>
              {anterior && (
                <span className="rv-var">
                  {(() => {
                    const c = comparar(notas, anterior.notas, DIMENSOES);
                    if (c.variacao === 0) return "igual à roda anterior";
                    return c.variacao > 0
                      ? `+${c.variacao.toFixed(1)} desde a roda anterior`
                      : `${c.variacao.toFixed(1)} desde a roda anterior`;
                  })()}
                </span>
              )}
            </div>
          </div>

          <div className="rv-lado">
            <div className="card">
              <h3>{PERGUNTA_REFLEXAO}</h3>
              <textarea
                rows={5} value={reflexao} disabled={salvando}
                onChange={(e) => setReflexao(e.target.value)}
                onBlur={guardarReflexao}
                placeholder="Escreva o que vier. Ninguém precisa ler isso além de você e da diretoria."
              />
            </div>

            <div className="card">
              <h3>O que está pedindo mais atenção</h3>
              <ul className="rv-baixas">
                {maisBaixas(notas, DIMENSOES, DIMENSOES_PARA_ESCOLHER).map((p) => (
                  <li key={p.id}>
                    <span className="rv-emoji">{p.emoji}</span>
                    <span className="rv-baixa-nome">{p.nome}</span>
                    <span className="rv-baixa-nota" style={{ color: corDaNota(p.nota) }}>{p.nota}</span>
                  </li>
                ))}
              </ul>
              <p className="rv-nota-info">
                São só as notas mais baixas — você escolhe o que quer cuidar, não precisa ser isto.
              </p>
            </div>

            {!concluida ? (
              <button className="btn primary" disabled={!fechada || salvando} onClick={concluir}>
                Fechar a roda e escolher minhas ações
              </button>
            ) : (
              <button className="btn" disabled={salvando} onClick={() => setEtapa("acoes")}>
                Ir para as ações
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- 3. ações --- */}
      {etapa === "acoes" && (
        <PainelAcoes
          roda={roda} notas={notas} salvando={salvando}
          onEscolher={escolherAcao} onMarcar={marcar} onTirar={tirarAcao}
        />
      )}

      {historico.length > 0 && (
        <div className="card rv-historico">
          <h3>Minhas rodas anteriores</h3>
          <ul>
            {historico.map((h) => (
              <li key={h.id}>
                <span>{formatDataHora(h.concluida_em ?? h.criada_em)}</span>
                <strong style={{ color: corDaNota(media(h.notas, DIMENSOES)) }}>
                  {media(h.notas, DIMENSOES).toFixed(1)}
                </strong>
                <span className="rv-hist-acoes">
                  {h.acoes.filter((a) => a.feita).length}/{h.acoes.length} ações feitas
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="rv-frase">{FRASE_FINAL}</p>
    </div>
  );
}

// ------------------------------------------------------------------ aviso

function AvisoPrivacidade({ souDiretoria }: { souDiretoria: boolean }) {
  return (
    <div className="rv-privacidade">
      <strong>Quem vê isto:</strong> só você e a diretoria. Colegas, gestores de setor e o
      time de TI não têm acesso à sua roda pelo sistema.
      {souDiretoria && " Como você é da diretoria, também vê a roda das outras pessoas."}
    </div>
  );
}

// ---------------------------------------------------------------- gráfico

/**
 * A roda em SVG puro.
 *
 * Cada fatia vai até a nota da dimensão — é a forma clássica da Roda da Vida,
 * e mostra o "buraco" melhor do que um polígono de linha. A roda anterior
 * aparece como contorno pontilhado, para a comparação ser visual.
 */
function GraficoRoda({ pontos, mostrarAnterior }: { pontos: PontoRoda[]; mostrarAnterior: boolean }) {
  const T = 460, C = T / 2, R = 150;
  const n = pontos.length;
  const anteriores = pontos.map((p) => p.anterior ?? 0);
  const temAnterior = mostrarAnterior && pontos.some((p) => p.anterior !== null);

  return (
    <svg viewBox={`0 0 ${T} ${T}`} className="rv-svg" role="img" aria-label="Roda da vida">
      {/* anéis de referência */}
      {[2, 4, 6, 8, 10].map((v) => (
        <circle key={v} cx={C} cy={C} r={(v / 10) * R} className="rv-anel" />
      ))}

      {/* fatias */}
      {pontos.map((p, i) => {
        const a0 = (Math.PI * 2 * (i - 0.5)) / n - Math.PI / 2;
        const a1 = (Math.PI * 2 * (i + 0.5)) / n - Math.PI / 2;
        const r = (p.nota / 10) * R;
        if (r <= 0) return null;
        const x0 = C + r * Math.cos(a0), y0 = C + r * Math.sin(a0);
        const x1 = C + r * Math.cos(a1), y1 = C + r * Math.sin(a1);
        return (
          <path
            key={p.id}
            d={`M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`}
            fill={corDaNota(p.nota)}
            fillOpacity="0.65"
            stroke="#fff"
            strokeWidth="1.5"
          >
            <title>{`${p.nome}: ${p.nota}`}</title>
          </path>
        );
      })}

      {/* contorno da roda anterior */}
      {temAnterior && (
        <polygon
          points={poligono(anteriores, C, C, R)}
          className="rv-anterior"
        />
      )}

      {/* raios e rótulos */}
      {pontos.map((p, i) => {
        const fim = vertice(i, n, C, C, R);
        const rot = vertice(i, n, C, C, R + 34);
        const dir = rot.x > C + 6 ? "start" : rot.x < C - 6 ? "end" : "middle";
        return (
          <g key={`r${p.id}`}>
            <line x1={C} y1={C} x2={fim.x} y2={fim.y} className="rv-raio" />
            <text x={rot.x} y={rot.y - 4} textAnchor={dir} className="rv-rotulo">
              {p.emoji} {p.nome}
            </text>
            <text x={rot.x} y={rot.y + 10} textAnchor={dir} className="rv-rotulo-nota"
                  fill={corDaNota(p.nota)}>
              {p.nota}
              {p.variacao !== null && p.variacao !== 0 && (
                <tspan className="rv-delta">
                  {" "}{p.variacao > 0 ? "▲" : "▼"}{Math.abs(p.variacao)}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ ações

function PainelAcoes({
  roda, notas, salvando, onEscolher, onMarcar, onTirar,
}: {
  roda: Roda;
  notas: Notas;
  salvando: boolean;
  onEscolher: (dimensao: string, acao: string) => void;
  onMarcar: (id: string, feita: boolean) => void;
  onTirar: (id: string) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [propria, setPropria] = useState("");

  const escolhidas = useMemo(() => {
    const m = new Map<string, Acao[]>();
    for (const a of roda.acoes) {
      const l = m.get(a.dimensao) ?? [];
      l.push(a);
      m.set(a.dimensao, l);
    }
    return m;
  }, [roda.acoes]);

  const prog = progressoAcoes(roda.acoes);
  const sugeridas = maisBaixas(notas, DIMENSOES, DIMENSOES_PARA_ESCOLHER).map((p) => p.id);

  return (
    <div className="rv-acoes">
      <div className="card rv-intro-acoes">
        <h2>🌱 Da reflexão à ação</h2>
        <p>
          Escolha {DIMENSOES_PARA_ESCOLHER} dimensões que você gostaria de cuidar com mais
          atenção e, para cada uma, ao menos uma ação concreta. Não precisa mudar tudo — uma
          pequena mudança já é um começo.
        </p>
        {prog.total > 0 && (
          <div className="rv-progresso">
            <div className="rv-barra"><div style={{ width: `${prog.pct}%` }} /></div>
            <span>{prog.feitas} de {prog.total} feitas</span>
          </div>
        )}
      </div>

      {prog.total > 0 && (
        <div className="card">
          <h3>Meu plano</h3>
          <ul className="rv-plano">
            {roda.acoes.map((a) => (
              <li key={a.id} className={a.feita ? "feita" : ""}>
                <label>
                  <input type="checkbox" checked={a.feita} disabled={salvando}
                         onChange={(e) => onMarcar(a.id, e.target.checked)} />
                  <span className="rv-emoji">{DIMENSAO_POR_ID[a.dimensao]?.emoji ?? "•"}</span>
                  <span className="rv-acao-txt">{a.acao}</span>
                </label>
                {a.feita && a.feita_em && (
                  <span className="rv-feita-em">{formatDataHora(a.feita_em)}</span>
                )}
                <button className="rv-x" title="Tirar do plano" disabled={salvando}
                        onClick={() => onTirar(a.id)}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rv-dims-acoes">
        {DIMENSOES.map((d) => {
          const minhas = escolhidas.get(d.id) ?? [];
          const sugerida = sugeridas.includes(d.id);
          const aberto = aberta === d.id;
          return (
            <div key={d.id} className={`card rv-dim-acao ${sugerida ? "sugerida" : ""}`}>
              <button className="rv-dim-cab" onClick={() => setAberta(aberto ? null : d.id)}>
                <span className="rv-emoji">{d.emoji}</span>
                <span className="rv-dim-nome">{d.nome}</span>
                <span className="rv-dim-nota" style={{ color: corDaNota(notas[d.id] ?? 0) }}>
                  {notas[d.id] ?? "—"}
                </span>
                {minhas.length > 0 && <span className="rv-dim-qtd">{minhas.length}</span>}
                {sugerida && minhas.length === 0 && <span className="rv-sugerida">sugerida</span>}
                <span className="rv-seta">{aberto ? "▲" : "▼"}</span>
              </button>

              {aberto && (
                <div className="rv-lista-acoes">
                  {d.chamada && <p className="rv-chamada">{d.chamada}</p>}
                  {d.acoes.map((a) => {
                    const ja = minhas.some((m) => m.acao === a);
                    return (
                      <label key={a} className={`rv-op ${ja ? "ja" : ""}`}>
                        <input type="checkbox" checked={ja} disabled={salvando || ja}
                               onChange={() => onEscolher(d.id, a)} />
                        <span>{a}</span>
                      </label>
                    );
                  })}

                  <div className="rv-propria">
                    <input
                      placeholder="Ou escreva a sua…"
                      value={aberta === d.id ? propria : ""}
                      disabled={salvando}
                      onChange={(e) => setPropria(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && propria.trim()) {
                          onEscolher(d.id, propria.trim());
                          setPropria("");
                        }
                      }}
                    />
                    <button className="btn" disabled={salvando || !propria.trim()}
                            onClick={() => { onEscolher(d.id, propria.trim()); setPropria(""); }}>
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
