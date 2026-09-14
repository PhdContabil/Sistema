"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";
import {
  SETOR_NOME, STATUS_NOME, primeiroNome, iniciais,
  type Ticket, type PessoaTickets,
} from "@/lib/tickets";
import {
  diasUteis, resumoCapacidade, formatDuracao, segundosEmHoras, fimPadrao,
  type LinhaCapacidade,
} from "@/lib/sprints-calculo";

// --------------------------------------------------------------------- tipos

interface Sprint {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  estado: "planejada" | "ativa" | "encerrada";
  objetivo: string | null;
  itens?: number;
}

interface ItemSprint {
  ticket_id: string;
  responsavel_email: string | null;
  horas_planejadas: number | null;
  ordem: number;
  ticket: Ticket | null;
  segundosExecutados: number;
  rodandoPor: string | null;
  rodandoDesde: string | null;
}

interface Capacidade {
  email: string;
  horas_dia: number;
  dias_ausente: number;
}

const ESTADO_COR: Record<string, string> = {
  planejada: "bg-slate-400 dark:bg-slate-500",
  ativa: "bg-emerald-500",
  encerrada: "bg-slate-300 dark:bg-slate-700",
};

const ESTADO_NOME: Record<string, string> = {
  planejada: "Planejada",
  ativa: "Ativa",
  encerrada: "Encerrada",
};

function hoje(): string {
  // Data local, não UTC: no fim da tarde o UTC já virou o dia seguinte.
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}` : iso;
}

function horasTexto(v: number): string {
  return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

// ================================================================ componente

export default function TicketsSprint({
  sprintInicial, sprints: sprintsIniciais, pessoasTI, meuEmail, souDoTI, erroServidor,
}: {
  sprintInicial: Sprint | null;
  sprints: Sprint[];
  pessoasTI: PessoaTickets[];
  meuEmail: string | null;
  souDoTI: boolean;
  erroServidor: string | null;
}) {
  const [sprints, setSprints] = useState<Sprint[]>(sprintsIniciais);
  const [sprintId, setSprintId] = useState<string | null>(sprintInicial?.id ?? null);
  const [sprint, setSprint] = useState<Sprint | null>(sprintInicial);
  const [itens, setItens] = useState<ItemSprint[]>([]);
  const [capacidade, setCapacidade] = useState<Capacidade[]>([]);
  const [backlog, setBacklog] = useState<Ticket[]>([]);

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(erroServidor);
  const [aviso, setAviso] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [buscaBacklog, setBuscaBacklog] = useState("");
  const [setorBacklog, setSetorBacklog] = useState("");
  const [agora, setAgora] = useState(() => Date.now());

  // Relógio de um segundo só para o cronômetro em andamento.
  useEffect(() => {
    const rodando = itens.some((i) => i.rodandoPor);
    if (!rodando) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [itens]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  const carregar = useCallback(async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sprints/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Não foi possível carregar a sprint.");
      setSprint(j.sprint);
      setItens(j.itens ?? []);
      setCapacidade(j.capacidade ?? []);
      setBacklog(j.backlog ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (sprintId) carregar(sprintId); }, [sprintId, carregar]);

  async function chamar(url: string, init: RequestInit): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
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

  // ------------------------------------------------------------- capacidade

  const diasDaSprint = sprint ? diasUteis(sprint.inicio, sprint.fim) : 0;

  const nomePorEmail = useMemo(
    () => Object.fromEntries(pessoasTI.map((p) => [p.email.toLowerCase(), p.name])),
    [pessoasTI]
  );

  const resumo = useMemo(
    () => resumoCapacidade(
      capacidade.map((c) => ({
        email: c.email,
        nome: nomePorEmail[c.email] ?? null,
        horas_dia: c.horas_dia,
        dias_ausente: c.dias_ausente,
      })),
      itens.map((i) => ({
        ticket_id: i.ticket_id,
        responsavel_email: i.responsavel_email,
        horas_planejadas: i.horas_planejadas,
      })),
      diasDaSprint,
      nomePorEmail
    ),
    [capacidade, itens, diasDaSprint, nomePorEmail]
  );

  /** Pessoas do TI que ainda não estão no capacity desta sprint. */
  const foraDoCapacity = useMemo(() => {
    const dentro = new Set(capacidade.map((c) => c.email.toLowerCase()));
    return pessoasTI.filter((p) => !dentro.has(p.email.toLowerCase()));
  }, [pessoasTI, capacidade]);

  async function definirCapacidade(email: string, campos: { horas_dia?: number; dias_ausente?: number }) {
    if (!sprintId) return;
    const ok = await chamar(`/api/sprints/${sprintId}/capacidade`, {
      method: "PUT",
      body: JSON.stringify({ email, ...campos }),
    });
    if (ok) carregar(sprintId);
  }

  async function tirarDoCapacity(email: string) {
    if (!sprintId) return;
    const ok = await chamar(`/api/sprints/${sprintId}/capacidade?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    if (ok) carregar(sprintId);
  }

  // ------------------------------------------------------------------ itens

  async function puxarParaSprint(t: Ticket) {
    if (!sprintId) return;
    const ok = await chamar(`/api/sprints/${sprintId}/itens`, {
      method: "POST",
      body: JSON.stringify({
        ticket_id: t.id,
        responsavel_email: meuEmail,
        horas_planejadas: t.horas_estimadas ?? null,
      }),
    });
    if (ok) { setAviso(`#${t.numero ?? "—"} entrou na sprint.`); carregar(sprintId); }
  }

  async function mudarItem(ticketId: string, campos: Record<string, unknown>) {
    if (!sprintId) return;
    const ok = await chamar(`/api/sprints/${sprintId}/itens`, {
      method: "PATCH",
      body: JSON.stringify({ ticket_id: ticketId, ...campos }),
    });
    if (ok) carregar(sprintId);
  }

  async function devolverAoBacklog(ticketId: string) {
    if (!sprintId) return;
    const ok = await chamar(`/api/sprints/${sprintId}/itens?ticket_id=${ticketId}`, { method: "DELETE" });
    if (ok) { setAviso("Cartão devolvido ao backlog."); carregar(sprintId); }
  }

  // ------------------------------------------------------------- cronômetro

  async function iniciar(item: ItemSprint) {
    if (!sprintId) return;
    const ok = await chamar("/api/sprints/execucao", {
      method: "POST",
      body: JSON.stringify({ acao: "iniciar", ticket_id: item.ticket_id, sprint_id: sprintId }),
    });
    if (!ok) return;
    // Sair do papel muda o status no board de quem pediu — é como o solicitante
    // percebe que a demanda começou, sem precisar entrar aqui.
    const st = item.ticket?.status;
    if (st === "backlog" || st === "analise") {
      await chamar(`/api/tickets/${item.ticket_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "desenvolvimento" }),
      });
    }
    carregar(sprintId);
  }

  async function pausar() {
    if (!sprintId) return;
    const ok = await chamar("/api/sprints/execucao", { method: "POST", body: JSON.stringify({ acao: "parar" }) });
    if (ok) carregar(sprintId);
  }

  async function finalizar(item: ItemSprint) {
    if (!sprintId) return;
    if (item.rodandoPor) {
      const ok = await chamar("/api/sprints/execucao", { method: "POST", body: JSON.stringify({ acao: "parar" }) });
      if (!ok) return;
    }
    const ok = await chamar(`/api/tickets/${item.ticket_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "finalizado" }),
    });
    if (ok) { setAviso("Cartão finalizado."); carregar(sprintId); }
  }

  // ------------------------------------------------------------------ render

  const backlogFiltrado = useMemo(() => {
    const q = buscaBacklog.trim().toLowerCase();
    return backlog.filter((t) => {
      if (setorBacklog && t.sector !== setorBacklog) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        String(t.numero ?? "").includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [backlog, buscaBacklog, setorBacklog]);

  const setoresNoBacklog = useMemo(
    () => [...new Set(backlog.map((t) => t.sector))].sort(),
    [backlog]
  );

  if (!souDoTI) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">
        A sprint é o planejamento do time de Tecnologia. Se você precisa de acesso, fale com o TI.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-2.5">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200 text-sm rounded-lg px-4 py-2.5">
          {aviso}
        </div>
      )}

      {/* ---- barra da sprint ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={INPUT}
          value={sprintId ?? ""}
          onChange={(e) => setSprintId(e.target.value || null)}
        >
          {sprints.length === 0 && <option value="">Nenhuma sprint ainda</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome} · {dataBR(s.inicio)}–{dataBR(s.fim)} · {ESTADO_NOME[s.estado]}
            </option>
          ))}
        </select>

        {sprint && (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className={`w-2 h-2 rounded-full ${ESTADO_COR[sprint.estado]}`} />
              {ESTADO_NOME[sprint.estado]}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {diasDaSprint} dias úteis
            </span>
            {sprint.estado !== "ativa" && (
              <button className={BTN} disabled={salvando}
                      onClick={async () => {
                        const ok = await chamar(`/api/sprints/${sprint.id}`, {
                          method: "PATCH", body: JSON.stringify({ estado: "ativa" }),
                        });
                        if (ok) { setAviso("Sprint ativada."); carregar(sprint.id); }
                      }}>
                Ativar
              </button>
            )}
            {sprint.estado === "ativa" && (
              <button className={BTN} disabled={salvando}
                      onClick={async () => {
                        const ok = await chamar(`/api/sprints/${sprint.id}`, {
                          method: "PATCH", body: JSON.stringify({ estado: "encerrada" }),
                        });
                        if (ok) { setAviso("Sprint encerrada."); carregar(sprint.id); }
                      }}>
                Encerrar
              </button>
            )}
          </>
        )}

        <div className="flex-1" />
        <button className={BTN_PRIMARY} onClick={() => setCriando(true)}>+ Nova sprint</button>
      </div>

      {!sprint ? (
        <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
          Nenhuma sprint criada ainda. Crie a primeira para começar a planejar.
        </div>
      ) : (
        <>
          {/* ---- capacidade ---- */}
          <div className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Capacidade do time</h3>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <strong className="text-slate-900 dark:text-white">{horasTexto(resumo.planejadoTotal)}</strong>
                {" de "}{horasTexto(resumo.capacidadeTotal)}
                {" · "}
                <span className={resumo.livreTotal < 0 ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                  {horasTexto(resumo.livreTotal)} livres
                </span>
              </div>
            </div>

            {resumo.linhas.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-3">
                Ninguém no capacity ainda — adicione as pessoas abaixo para ver o tempo livre.
              </p>
            )}

            <div className="space-y-2.5">
              {resumo.linhas.map((l) => (
                <LinhaPessoa
                  key={l.email} l={l} salvando={salvando}
                  onMudar={(campos) => definirCapacidade(l.email, campos)}
                  onTirar={() => tirarDoCapacity(l.email)}
                />
              ))}
            </div>

            {resumo.semResponsavel.itens > 0 && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                {resumo.semResponsavel.itens} cartão(ões) sem responsável, somando{" "}
                {horasTexto(resumo.semResponsavel.horas)} — essas horas pesam na sprint mas não
                estão na conta de ninguém.
              </p>
            )}

            {foraDoCapacity.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <select className={`${INPUT} text-xs`} defaultValue=""
                        onChange={(e) => { if (e.target.value) { definirCapacidade(e.target.value, { horas_dia: 6 }); e.target.value = ""; } }}>
                  <option value="">+ Adicionar pessoa ao capacity…</option>
                  {foraDoCapacity.map((p) => (
                    <option key={p.email} value={p.email}>{p.name}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400 dark:text-slate-500">entra com 6 h/dia</span>
              </div>
            )}
          </div>

          {/* ---- itens da sprint ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Nesta sprint <span className="text-slate-400 dark:text-slate-500 font-normal">({itens.length})</span>
              </h3>
              <button className={BTN} onClick={() => setEscolhendo(true)}>+ Puxar do backlog</button>
            </div>

            {carregando && <div className="text-sm text-slate-400 dark:text-slate-500 py-4">Carregando…</div>}

            {!carregando && itens.length === 0 && (
              <div className={`${CARD} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>
                Sprint vazia. Use <strong>Puxar do backlog</strong> para trazer cartões de qualquer equipe.
              </div>
            )}

            <div className="space-y-2">
              {itens.map((i) => (
                <CartaoSprint
                  key={i.ticket_id}
                  item={i} agora={agora} meuEmail={meuEmail} pessoasTI={pessoasTI} salvando={salvando}
                  encerrada={sprint.estado === "encerrada"}
                  onMudar={(campos) => mudarItem(i.ticket_id, campos)}
                  onIniciar={() => iniciar(i)}
                  onPausar={pausar}
                  onFinalizar={() => finalizar(i)}
                  onDevolver={() => devolverAoBacklog(i.ticket_id)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---- criar sprint ---- */}
      {criando && (
        <NovaSprint
          onFechar={() => setCriando(false)}
          onCriada={(nova) => {
            setSprints((s) => [nova, ...s]);
            setSprintId(nova.id);
            setCriando(false);
            setAviso("Sprint criada.");
          }}
        />
      )}

      {/* ---- escolher do backlog ---- */}
      {escolhendo && sprint && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
             onClick={() => setEscolhendo(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Backlog de todas as equipes</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cartões em aberto que ainda não estão em nenhuma sprint.
                </p>
              </div>
              <button className={BTN} onClick={() => setEscolhendo(false)}>Fechar</button>
            </div>

            <div className="flex gap-2 p-4 border-b border-slate-200 dark:border-slate-800">
              <input className={`${INPUT} flex-1`} placeholder="Buscar por número, título ou descrição…"
                     value={buscaBacklog} onChange={(e) => setBuscaBacklog(e.target.value)} />
              <select className={INPUT} value={setorBacklog} onChange={(e) => setSetorBacklog(e.target.value)}>
                <option value="">Todos os setores</option>
                {setoresNoBacklog.map((s) => <option key={s} value={s}>{SETOR_NOME[s] ?? s}</option>)}
              </select>
            </div>

            <div className="overflow-y-auto p-4 space-y-2">
              {backlogFiltrado.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Nada encontrado.</p>
              )}
              {backlogFiltrado.map((t) => (
                <div key={t.id} className={`${CARD} p-3 flex items-start gap-3`}>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500 pt-0.5 shrink-0">
                    #{t.numero ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {SETOR_NOME[t.sector] ?? t.sector} · {STATUS_NOME[t.status] ?? t.status}
                      {t.horas_estimadas ? ` · ${horasTexto(Number(t.horas_estimadas))} estimadas` : ""}
                    </div>
                  </div>
                  <button className={BTN} disabled={salvando} onClick={() => puxarParaSprint(t)}>
                    Puxar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ linha do time

function LinhaPessoa({
  l, salvando, onMudar, onTirar,
}: {
  l: LinhaCapacidade;
  salvando: boolean;
  onMudar: (campos: { horas_dia?: number; dias_ausente?: number }) => void;
  onTirar: () => void;
}) {
  const [hd, setHd] = useState(String(l.horasDia));
  const [da, setDa] = useState(String(l.diasAusente));
  useEffect(() => { setHd(String(l.horasDia)); setDa(String(l.diasAusente)); }, [l.horasDia, l.diasAusente]);

  const pct = Math.min(100, Math.max(0, l.ocupacao));

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold
                         text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
          {iniciais(l.nome, l.email)}
        </span>
        <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
          {l.nome ?? l.email}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className={`h-full rounded-full ${l.estourou ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-emerald-500"}`}
               style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          {horasTexto(l.planejado)} de {horasTexto(l.capacidade)} · {l.itens} cartão(ões) ·{" "}
          <span className={l.livre < 0 ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
            {l.livre < 0 ? `${horasTexto(Math.abs(l.livre))} além do limite` : `${horasTexto(l.livre)} livres`}
          </span>
        </div>
      </div>

      <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
        <input className={`${INPUT} w-14 px-2 py-1 text-xs`} inputMode="decimal" value={hd} disabled={salvando}
               onChange={(e) => setHd(e.target.value)}
               onBlur={() => { const n = Number(hd.replace(",", ".")); if (Number.isFinite(n) && n !== l.horasDia) onMudar({ horas_dia: n }); }} />
        h/dia
      </label>
      <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0"
             title="Dias fora na sprint: férias, feriado, treinamento">
        <input className={`${INPUT} w-12 px-2 py-1 text-xs`} inputMode="decimal" value={da} disabled={salvando}
               onChange={(e) => setDa(e.target.value)}
               onBlur={() => { const n = Number(da.replace(",", ".")); if (Number.isFinite(n) && n !== l.diasAusente) onMudar({ dias_ausente: n }); }} />
        fora
      </label>
      <button className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 text-sm shrink-0"
              title="Tirar do capacity desta sprint" disabled={salvando} onClick={onTirar}>
        ✕
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ cartão

function CartaoSprint({
  item, agora, meuEmail, pessoasTI, salvando, encerrada,
  onMudar, onIniciar, onPausar, onFinalizar, onDevolver,
}: {
  item: ItemSprint;
  agora: number;
  meuEmail: string | null;
  pessoasTI: PessoaTickets[];
  salvando: boolean;
  encerrada: boolean;
  onMudar: (campos: Record<string, unknown>) => void;
  onIniciar: () => void;
  onPausar: () => void;
  onFinalizar: () => void;
  onDevolver: () => void;
}) {
  const t = item.ticket;
  const [horas, setHoras] = useState(item.horas_planejadas != null ? String(item.horas_planejadas) : "");
  useEffect(() => {
    setHoras(item.horas_planejadas != null ? String(item.horas_planejadas) : "");
  }, [item.horas_planejadas]);

  // Tempo já fechado + o intervalo em aberto, contando na tela.
  const emAndamento = item.rodandoDesde
    ? Math.max(0, Math.round((agora - new Date(item.rodandoDesde).getTime()) / 1000))
    : 0;
  const totalSegundos = item.segundosExecutados + emAndamento;

  const souEu = !!item.rodandoPor && item.rodandoPor === meuEmail;
  const outroRodando = !!item.rodandoPor && item.rodandoPor !== meuEmail;
  const finalizado = t?.status === "finalizado";

  const estimado = Number(item.horas_planejadas ?? 0);
  const gasto = segundosEmHoras(totalSegundos);
  const estourou = estimado > 0 && gasto > estimado;

  return (
    <div className={`${CARD} p-3 ${item.rodandoPor ? "ring-1 ring-emerald-400 dark:ring-emerald-600" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-slate-400 dark:text-slate-500 pt-0.5 shrink-0">
          #{t?.numero ?? "—"}
        </span>

        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${finalizado ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>
            {t?.title ?? "Cartão removido"}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t ? (SETOR_NOME[t.sector] ?? t.sector) : "—"}</span>
            <span>·</span>
            <span>{t ? (STATUS_NOME[t.status] ?? t.status) : "—"}</span>
            {totalSegundos > 0 && (
              <>
                <span>·</span>
                <span className={estourou ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                  {formatDuracao(totalSegundos)} executados
                  {estimado > 0 && ` de ${horasTexto(estimado)}`}
                </span>
              </>
            )}
            {item.rodandoPor && (
              <>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ▶ {souEu ? "você está" : `${primeiroNome(null, item.rodandoPor)} está`} contando
                </span>
              </>
            )}
          </div>
        </div>

        {/* responsável */}
        <select
          className={`${INPUT} text-xs py-1 w-32 shrink-0`}
          value={item.responsavel_email ?? ""}
          disabled={salvando || encerrada}
          onChange={(e) => onMudar({ responsavel_email: e.target.value || null })}
        >
          <option value="">Sem dono</option>
          {pessoasTI.map((p) => (
            <option key={p.email} value={p.email}>{primeiroNome(p.name, p.email)}</option>
          ))}
        </select>

        {/* horas planejadas */}
        <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0"
               title="Horas que este cartão vai consumir da sprint">
          <input className={`${INPUT} w-14 px-2 py-1 text-xs`} inputMode="decimal" value={horas}
                 disabled={salvando || encerrada}
                 onChange={(e) => setHoras(e.target.value)}
                 onBlur={() => {
                   const bruto = horas.trim();
                   const n = bruto === "" ? null : Number(bruto.replace(",", "."));
                   if (n === null || Number.isFinite(n)) onMudar({ horas_planejadas: bruto === "" ? "" : n });
                 }} />
          h
        </label>

        {/* cronômetro */}
        <div className="flex items-center gap-1 shrink-0">
          {!finalizado && (
            souEu ? (
              <button className={BTN} disabled={salvando} onClick={onPausar} title="Pausar o cronômetro">
                ⏸ Pausar
              </button>
            ) : (
              <button className={BTN} disabled={salvando || encerrada} onClick={onIniciar}
                      title={outroRodando ? "Outra pessoa está contando neste cartão" : "Iniciar o cronômetro"}>
                ▶ Iniciar
              </button>
            )
          )}
          {!finalizado && (
            <button className={BTN} disabled={salvando || encerrada} onClick={onFinalizar} title="Finalizar o cartão">
              ✓
            </button>
          )}
          <button className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 text-sm px-1"
                  title="Devolver ao backlog" disabled={salvando || encerrada} onClick={onDevolver}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- nova sprint

function NovaSprint({
  onFechar, onCriada,
}: {
  onFechar: () => void;
  onCriada: (s: Sprint) => void;
}) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState(hoje());
  const [fim, setFim] = useState(fimPadrao(hoje()));
  const [objetivo, setObjetivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const dias = diasUteis(inicio, fim);

  async function criar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), inicio, fim, objetivo: objetivo.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Não foi possível criar."); return; }
      onCriada({ id: j.id, nome: nome.trim(), inicio, fim, estado: "planejada", objetivo: objetivo.trim() || null, itens: 0 });
    } catch {
      setErro("Falha de rede.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Nova sprint</h3>

        {erro && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-3 py-2 mb-3">
            {erro}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Nome</span>
            <input className={`${INPUT} w-full mt-1`} value={nome} onChange={(e) => setNome(e.target.value)}
                   placeholder="Ex.: Sprint 01 · setembro" autoFocus />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Início</span>
              <input type="date" className={`${INPUT} w-full mt-1`} value={inicio}
                     onChange={(e) => { setInicio(e.target.value); setFim(fimPadrao(e.target.value)); }} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Fim</span>
              <input type="date" className={`${INPUT} w-full mt-1`} value={fim}
                     onChange={(e) => setFim(e.target.value)} />
            </label>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dias} dias úteis. O fim vem preenchido com 15 dias corridos a partir do início;
            dá para mudar.
          </p>

          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Objetivo (opcional)</span>
            <textarea className={`${INPUT} w-full mt-1`} rows={2} value={objetivo}
                      onChange={(e) => setObjetivo(e.target.value)}
                      placeholder="O que esta sprint precisa entregar." />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className={BTN} onClick={onFechar}>Cancelar</button>
          <button className={BTN_PRIMARY} disabled={salvando || !nome.trim()} onClick={criar}>
            {salvando ? "Criando…" : "Criar sprint"}
          </button>
        </div>
      </div>
    </div>
  );
}
