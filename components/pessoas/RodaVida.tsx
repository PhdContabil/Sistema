"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DIMENSOES, DIMENSAO_POR_ID, ESCALA, PERGUNTA_REFLEXAO, FRASE_FINAL,
  DIMENSOES_PARA_ESCOLHER,
} from "@/lib/roda-vida-conteudo";
import {
  pontosDaRoda, media, respondidas, completa, maisBaixas,
  poligono, vertice, comparar, corDaNota, progressoAcoes, evolucao,
  type Notas, type PontoRoda, type Evolucao,
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
  enviada_em?: string | null;
  enviada_para?: string | null;
}

/** "2026-09-22T…" → "22/09". Rótulo curto do eixo do gráfico. */
function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

type Etapa = "notas" | "roda" | "acoes" | "evolucao";

export default function RodaVida({
  rodaInicial, historicoInicial, meuEmail, souDiretoria, emailPessoalInicial,
}: {
  rodaInicial: Roda | null;
  historicoInicial: Roda[];
  meuEmail: string | null;
  souDiretoria: boolean;
  /** E-mail pessoal já cadastrado, se houver. */
  emailPessoalInicial: string | null;
}) {
  const [roda, setRoda] = useState<Roda | null>(rodaInicial);
  const [historico, setHistorico] = useState<Roda[]>(historicoInicial);
  const [etapa, setEtapa] = useState<Etapa>(() =>
    rodaInicial?.concluida_em ? "roda" : "notas"
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reflexao, setReflexao] = useState(rodaInicial?.reflexao ?? "");
  const [emailPessoal, setEmailPessoal] = useState(emailPessoalInicial ?? "");
  const [enviando, setEnviando] = useState(false);
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
    setAviso("Roda da Vida fechada. Agora escolha o que quer cuidar.");
  }

  /**
   * Abre uma roda nova. A anterior fica intacta no histórico — é o que permite
   * comparar depois. Roda fechada não volta a ser editada: se ela pudesse
   * mudar, a linha do tempo mudaria junto e a evolução deixaria de significar
   * alguma coisa.
   */
  async function novaRoda() {
    if (!(await chamar("/api/roda-vida", { method: "POST" }))) return;
    await recarregar();
    setEtapa("notas");
    setAviso("Roda da Vida nova aberta. A anterior continua no histórico.");
  }

  async function guardarEmail() {
    const valor = emailPessoal.trim();
    if (valor === (emailPessoalInicial ?? "")) return;
    if (await chamar("/api/roda-vida/email", {
      method: "PUT", body: JSON.stringify({ email_pessoal: valor || null }),
    })) setAviso(valor ? "E-mail guardado." : "E-mail removido.");
  }

  /**
   * Envia a roda e o plano para o e-mail pessoal. Manual: a pessoa decide
   * quando — normalmente depois de escolher as ações, que é o que dá conteúdo
   * ao e-mail.
   */
  async function enviarPorEmail() {
    if (!roda) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/roda-vida/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roda_id: roda.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não consegui enviar."); return; }
      setAviso(`Enviado para ${j.destino}.`);
      recarregar();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setEnviando(false);
    }
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
          <div className="card rv-convite">
          <h2>Como está a sua vida hoje?</h2>
          <p>
            São {DIMENSOES.length} dimensões. Para cada uma, algumas perguntas para pensar e
            uma nota de {ESCALA.min} a {ESCALA.max}. No fim, a sua Roda da Vida aparece — e você
            escolhe o que quer cuidar primeiro.
          </p>
          <p className="rv-escala">
            <strong>{ESCALA.min}</strong> = {ESCALA.legendaMin} · <strong>{ESCALA.max}</strong> = {ESCALA.legendaMax}
          </p>
          <div className="rv-email-campo">
            <label>
              <span>Seu e-mail pessoal (opcional)</span>
              <input type="email" value={emailPessoal} disabled={salvando}
                     placeholder="voce@exemplo.com"
                     onChange={(e) => setEmailPessoal(e.target.value)}
                     onBlur={guardarEmail} />
            </label>
            <p className="rv-nota-info">
              No fim, você pode receber a sua Roda da Vida e as ações que escolheu neste endereço.
              Dá para cadastrar depois também.
            </p>
          </div>

          <button className="btn primary" disabled={salvando} onClick={comecar}>
            Começar minha Roda da Vida
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


      <div className="rv-abas">
        <button className={`chip ${etapa === "notas" ? "on" : ""}`} onClick={() => setEtapa("notas")}>
          1. Refletir e pontuar {quantas < DIMENSOES.length && `(${quantas}/${DIMENSOES.length})`}
        </button>
        <button className={`chip ${etapa === "roda" ? "on" : ""}`} onClick={() => setEtapa("roda")}>
          2. Minha Roda da Vida
        </button>
        <button className={`chip ${etapa === "acoes" ? "on" : ""}`} onClick={() => setEtapa("acoes")}>
          3. Da reflexão à ação {roda.acoes.length > 0 && `(${roda.acoes.length})`}
        </button>

        {historico.length > 0 && (
          <button className={`chip ${etapa === "evolucao" ? "on" : ""}`} onClick={() => setEtapa("evolucao")}>
            Evolução
          </button>
        )}

        <span className="rv-estado">
          {concluida
            ? `Fechada em ${formatDataHora(roda.concluida_em!)}`
            : "Rascunho — só você está vendo"}
        </span>

        {concluida && (
          <button className="btn primary rv-nova" disabled={salvando} onClick={novaRoda}>
            + Nova Roda da Vida
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- 1. notas --- */}
      {etapa === "notas" && (
        <div className="rv-notas">
          {concluida && (
            <p className="rv-nota-info">
              Esta Roda da Vida está fechada e não muda mais — é o que mantém a evolução confiável.
              Para pontuar de novo, use <strong>+ Nova Roda da Vida</strong> acima.
            </p>
          )}

          {DIMENSOES.map((d) => (
            <CartaoDimensao
              key={d.id} d={d} nota={notas[d.id]} travada={salvando || concluida}
              perguntasAbertas={abertas.has(d.id)}
              onAlternarPerguntas={() => setAbertas((s) => {
                const n = new Set(s);
                if (n.has(d.id)) n.delete(d.id); else n.add(d.id);
                return n;
              })}
              onNota={(n) => darNota(d.id, n)}
            />
          ))}

          <div className="rv-rodape">
            <span>
              {quantas} de {DIMENSOES.length} respondidas
              {fechada ? " — pode fechar a Roda da Vida." : "."}
            </span>
            <button className="btn primary" disabled={!fechada || salvando || concluida}
                    onClick={() => setEtapa("roda")}>
              Ver minha Roda da Vida
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
              <span className="k">Média da Roda da Vida</span>
              <span className="v" style={{ color: corDaNota(media(notas, DIMENSOES)) }}>
                {media(notas, DIMENSOES).toFixed(1)}
              </span>
              {anterior && (
                <span className="rv-var">
                  {(() => {
                    const c = comparar(notas, anterior.notas, DIMENSOES);
                    if (c.variacao === 0) return "igual à Roda da Vida anterior";
                    return c.variacao > 0
                      ? `+${c.variacao.toFixed(1)} desde a Roda da Vida anterior`
                      : `${c.variacao.toFixed(1)} desde a Roda da Vida anterior`;
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
                placeholder="Escreva o que vier — não precisa ficar bonito."
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
                Fechar a Roda da Vida e escolher minhas ações
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
        <>
          <PainelAcoes
            roda={roda} notas={notas} salvando={salvando}
            onEscolher={escolherAcao} onMarcar={marcar} onTirar={tirarAcao}
          />

          {concluida && (
            <div className="card rv-envio">
              <h3>Receber por e-mail</h3>
              <p className="rv-nota-info">
                Mandamos a sua Roda da Vida e as ações que você escolheu para o seu e-mail pessoal,
                com algumas perguntas para transformar a intenção em compromisso.
              </p>

              <div className="rv-envio-linha">
                <input type="email" value={emailPessoal} disabled={salvando || enviando}
                       placeholder="voce@exemplo.com"
                       onChange={(e) => setEmailPessoal(e.target.value)}
                       onBlur={guardarEmail} />
                <button className="btn primary" disabled={enviando || !emailPessoal.trim()}
                        onClick={enviarPorEmail}>
                  {enviando ? "Enviando…" : "Enviar para mim"}
                </button>
              </div>

              {roda.enviada_em && (
                <p className="rv-nota-info">
                  Já enviado para {roda.enviada_para} em {formatDataHora(roda.enviada_em)}.
                  Pode enviar de novo se mudar as ações.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {etapa === "evolucao" && (
        <PainelEvolucao rodas={historico} />
      )}

      {etapa !== "evolucao" && historico.length > 0 && (
        <div className="card rv-historico">
          <h3>Minhas Rodas da Vida anteriores</h3>
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

/**
 * Aviso de quem tem acesso — removido a pedido (21/09/2026).
 *
 * Fica registrado porque a informação continua verdadeira: a diretoria vê a
 * roda de todo mundo. A tela deixou de dizer isso, mas também não afirma o
 * contrário: nenhum texto aqui promete privacidade que o sistema não entrega.
 * Se um dia o acesso for restringido só ao dono, dá para voltar a falar disso
 * abertamente.
 */

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
                  {d.aviso && <p className="rv-aviso-dim">{d.aviso}</p>}
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

// ------------------------------------------------------- cartão da dimensão

/**
 * Uma dimensão na hora de pontuar.
 *
 * Régua contínua em vez de onze botões: o gesto é de posicionar-se numa escala,
 * não de escolher um item de lista. As âncoras embaixo ("Muito baixo", "Neutro",
 * "Excelente") dizem o que os extremos significam sem precisar de legenda à
 * parte, e a descrição ao lado do nome evita que cada pessoa interprete a
 * dimensão de um jeito.
 */
function CartaoDimensao({
  d, nota, travada, perguntasAbertas, onAlternarPerguntas, onNota,
}: {
  d: (typeof DIMENSOES)[number];
  nota: number | undefined;
  travada: boolean;
  perguntasAbertas: boolean;
  onAlternarPerguntas: () => void;
  onNota: (n: number) => void;
}) {
  // Enquanto arrasta, o número acompanha o dedo; só solta é que grava.
  const [local, setLocal] = useState<number | null>(null);
  const valor = local ?? nota ?? 5;
  const respondida = nota !== undefined && nota !== null;

  useEffect(() => { setLocal(null); }, [nota]);

  return (
    <div className={`card rv-dim ${respondida ? "respondida" : ""}`}>
      <div className="rv-dim-topo">
        <div className="rv-dim-id">
          <h3><span className="rv-emoji">{d.emoji}</span> {d.nome}</h3>
          <p className="rv-dim-desc">{d.descricao}</p>
        </div>
        <span className="rv-dim-valor" style={{ color: respondida || local !== null ? corDaNota(valor) : undefined }}>
          {respondida || local !== null ? valor : "—"}
          <small>/10</small>
        </span>
      </div>

      <div className="rv-regua">
        <input
          type="range" min={0} max={10} step={1} value={valor} disabled={travada}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={(e) => onNota(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => onNota(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onNota(Number((e.target as HTMLInputElement).value))}
          aria-label={`Nota de ${d.nome}`}
          style={{ ["--pct" as string]: `${valor * 10}%` }}
        />
        <div className="rv-ancoras">
          <span>{ESCALA.ancoras.baixo}</span>
          <span className="meio">{ESCALA.ancoras.meio}</span>
          <span>{ESCALA.ancoras.alto}</span>
        </div>
      </div>

      <button className="rv-link" onClick={onAlternarPerguntas}>
        {perguntasAbertas ? "esconder as perguntas" : `ver ${d.perguntas.length} perguntas para pensar`}
      </button>

      {perguntasAbertas && (
        <ul className="rv-perguntas">
          {d.perguntas.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------- evolução

function PainelEvolucao({ rodas }: { rodas: Roda[] }) {
  const [dimSel, setDimSel] = useState<string>("");

  const ev: Evolucao = useMemo(
    () => evolucao(
      rodas.map((r) => ({
        id: r.id,
        data: r.concluida_em ?? r.criada_em,
        notas: r.notas,
        acoes: r.acoes,
      })),
      DIMENSOES
    ),
    [rodas]
  );

  if (ev.pontos.length === 0) {
    return (
      <div className="card rv-convite">
        <p>Nenhuma Roda da Vida fechada ainda — a evolução aparece a partir da primeira.</p>
      </div>
    );
  }

  const umaSo = ev.pontos.length === 1;
  const serieSel = dimSel ? ev.series.find((s) => s.id === dimSel) ?? null : null;

  return (
    <div className="rv-evolucao">
      <div className="rv-ev-topo">
        <div className="card">
          <span className="k">Rodas da Vida fechadas</span>
          <span className="v">{ev.pontos.length}</span>
        </div>
        <div className="card">
          <span className="k">Primeira</span>
          <span className="v" style={{ color: corDaNota(ev.mediaPrimeira) }}>{ev.mediaPrimeira.toFixed(1)}</span>
        </div>
        <div className="card">
          <span className="k">Atual</span>
          <span className="v" style={{ color: corDaNota(ev.mediaUltima) }}>{ev.mediaUltima.toFixed(1)}</span>
        </div>
        <div className="card">
          <span className="k">Desde a primeira</span>
          <span className="v">
            {umaSo ? "—" : `${ev.mediaUltima - ev.mediaPrimeira > 0 ? "+" : ""}${(ev.mediaUltima - ev.mediaPrimeira).toFixed(1)}`}
          </span>
        </div>
      </div>

      {umaSo && (
        <p className="rv-nota-info">
          Só há uma Roda da Vida até agora. Faça uma nova daqui a algumas semanas e esta tela passa a
          mostrar o que mudou.
        </p>
      )}

      {/* média ao longo do tempo */}
      <div className="card">
        <h3>Média ao longo do tempo</h3>
        <LinhaTempo
          pontos={ev.pontos.map((p) => ({ rotulo: dataCurta(p.data), valor: p.media }))}
          cor="var(--accent)"
        />
      </div>

      {/* dimensão a dimensão */}
      <div className="card">
        <div className="rv-ev-cab">
          <h3>Dimensão a dimensão</h3>
          <select className="rv-sel" value={dimSel} onChange={(e) => setDimSel(e.target.value)}>
            <option value="">Todas, lado a lado</option>
            {DIMENSOES.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>

        {serieSel ? (
          <>
            <LinhaTempo
              pontos={serieSel.valores.map((v, i) => ({ rotulo: dataCurta(ev.pontos[i].data), valor: v }))}
              cor={corDaNota(serieSel.ultima)}
            />
            <p className="rv-nota-info">
              {serieSel.emoji} {serieSel.nome}: saiu de <strong>{serieSel.primeira}</strong> e está em{" "}
              <strong>{serieSel.ultima}</strong>. Melhor momento: {serieSel.melhor}. Pior: {serieSel.pior}.
            </p>
          </>
        ) : (
          <ul className="rv-ev-dims">
            {[...ev.series].sort((a, b) => b.variacao - a.variacao).map((s) => (
              <li key={s.id}>
                <span className="rv-emoji">{s.emoji}</span>
                <span className="rv-ev-nome">{s.nome}</span>
                <Faixa valores={s.valores} />
                <span className="rv-ev-de-para">
                  {s.primeira} <span className="rv-ev-seta">→</span>{" "}
                  <strong style={{ color: corDaNota(s.ultima) }}>{s.ultima}</strong>
                </span>
                <span className={`rv-ev-var ${s.variacao > 0 ? "sobe" : s.variacao < 0 ? "desce" : ""}`}>
                  {umaSo ? "—" : s.variacao === 0 ? "igual" : `${s.variacao > 0 ? "+" : ""}${s.variacao}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(ev.maiorAlta || ev.maiorQueda) && (
        <div className="rv-ev-destaques">
          {ev.maiorAlta && (
            <div className="card rv-ev-alta">
              <span className="k">Maior avanço</span>
              <span className="v">{ev.maiorAlta.emoji} {ev.maiorAlta.nome}</span>
              <span className="rv-ev-obs">+{ev.maiorAlta.variacao} desde a primeira Roda da Vida</span>
            </div>
          )}
          {ev.maiorQueda && (
            <div className="card rv-ev-queda">
              <span className="k">Mais pediu atenção</span>
              <span className="v">{ev.maiorQueda.emoji} {ev.maiorQueda.nome}</span>
              <span className="rv-ev-obs">{ev.maiorQueda.variacao} desde a primeira Roda da Vida</span>
            </div>
          )}
        </div>
      )}

      {/* teste por teste */}
      <div className="card">
        <h3>Uma a uma</h3>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="col-empresa">Roda da Vida</th>
                <th className="num">Média</th>
                <th className="num">Variação</th>
                {DIMENSOES.map((d) => <th key={d.id} className="num" title={d.nome}>{d.emoji}</th>)}
                <th className="num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[...ev.pontos].reverse().map((p) => (
                <tr key={p.id}>
                  <td className="col-empresa">
                    <strong>{p.numero}ª</strong> <span className="rv-ev-data">{formatDataHora(p.data)}</span>
                  </td>
                  <td className="num" style={{ color: corDaNota(p.media), fontWeight: 600 }}>
                    {p.media.toFixed(1)}
                  </td>
                  <td className={`num rv-ev-var ${(p.variacao ?? 0) > 0 ? "sobe" : (p.variacao ?? 0) < 0 ? "desce" : ""}`}>
                    {p.variacao === null ? "—" : p.variacao === 0 ? "=" : `${p.variacao > 0 ? "+" : ""}${p.variacao}`}
                  </td>
                  {DIMENSOES.map((d) => (
                    <td key={d.id} className="num" style={{ color: corDaNota(p.notas[d.id] ?? 0) }}>
                      {p.notas[d.id] ?? "—"}
                    </td>
                  ))}
                  <td className="num">{p.acoesTotal > 0 ? `${p.acoesFeitas}/${p.acoesTotal}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Gráfico de linha simples — a escala é sempre 0 a 10, como as notas. */
function LinhaTempo({
  pontos, cor,
}: {
  pontos: { rotulo: string; valor: number }[];
  cor: string;
}) {
  const L = 34, T = 10, R = 10, B = 26;
  const W = 640, H = 200;
  const areaW = W - L - R, areaH = H - T - B;
  const n = pontos.length;

  const x = (i: number) => L + (n === 1 ? areaW / 2 : (areaW * i) / (n - 1));
  const y = (v: number) => T + areaH - (areaH * v) / 10;

  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.valor)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rv-linha" role="img" aria-label="Evolução ao longo do tempo">
      {[0, 2.5, 5, 7.5, 10].map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} className="rv-anel" />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="rv-eixo">{v}</text>
        </g>
      ))}

      {n > 1 && <path d={caminho} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.valor)} r="4" fill={cor} />
          <text x={x(i)} y={y(p.valor) - 10} textAnchor="middle" className="rv-eixo-valor" fill={cor}>
            {p.valor.toFixed(1)}
          </text>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="rv-eixo">{p.rotulo}</text>
        </g>
      ))}
    </svg>
  );
}

/** Mini barras de uma dimensão, uma por roda — cabe na linha da lista. */
function Faixa({ valores }: { valores: number[] }) {
  return (
    <span className="rv-faixa">
      {valores.map((v, i) => (
        <span key={i} title={`${v}/10`}
              style={{ height: `${Math.max(6, v * 10)}%`, background: corDaNota(v) }} />
      ))}
    </span>
  );
}
