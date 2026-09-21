"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";
import {
  SETORES, STATUS, SETOR_NOME, STATUS_NOME, primeiroNome, iniciais,
  type Ticket, type PessoaTickets,
} from "@/lib/tickets";
import {
  diasUteis, resumoCapacidade, fimPadrao, restante, horasEmTexto,
  burndown, analytics,
  type LinhaCapacidade, type PontoBurndown, type Analytics,
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

interface Apontamento {
  id: string;
  email: string;
  data: string;
  segundos: number;
  horas: number;
  comentario: string | null;
}

interface ItemSprint {
  ticket_id: string;
  responsavel_email: string | null;
  horas_planejadas: number | null;
  ordem: number;
  ticket: Ticket | null;
  segundosExecutados: number;
  horasApontadas: number;
  apontamentos: Apontamento[];
}

interface Folga {
  id: string;
  data: string;
  email: string | null;
  motivo: string | null;
}

interface Capacidade { email: string; horas_dia: number }

const STATUS_COR: Record<string, string> = {
  backlog: "bg-slate-400 dark:bg-slate-500",
  analise: "bg-blue-500",
  desenvolvimento: "bg-purple-500",
  operacao_assistida: "bg-amber-500",
  finalizado: "bg-emerald-500",
};

const ESTADO_NOME: Record<string, string> = {
  planejada: "Planejada", ativa: "Ativa", encerrada: "Encerrada",
};

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}` : iso;
}

function horasTexto(v: number): string {
  return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

type Aba = "board" | "capacidade" | "backlog" | "analytics";

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
  const [folgas, setFolgas] = useState<Folga[]>([]);
  const [backlog, setBacklog] = useState<Ticket[]>([]);

  const [aba, setAba] = useState<Aba>("board");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(erroServidor);
  const [aviso, setAviso] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [pessoaFiltro, setPessoaFiltro] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<string | null>(null);

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
      setFolgas(j.folgas ?? []);
      setBacklog(j.backlog ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (sprintId) carregar(sprintId); }, [sprintId, carregar]);

  const chamar = useCallback(async (url: string, init: RequestInit): Promise<boolean> => {
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
  }, []);

  // ------------------------------------------------------------- capacidade

  const nomePorEmail = useMemo(
    () => Object.fromEntries(pessoasTI.map((p) => [p.email.toLowerCase(), p.name])),
    [pessoasTI]
  );

  const resumo = useMemo(() => {
    if (!sprint) {
      return {
        linhas: [] as LinhaCapacidade[], capacidadeTotal: 0, planejadoTotal: 0,
        livreTotal: 0, semResponsavel: { horas: 0, itens: 0 }, diasUteisSprint: 0,
      };
    }
    return resumoCapacidade(
      capacidade.map((c) => ({ email: c.email, nome: nomePorEmail[c.email] ?? null, horas_dia: c.horas_dia })),
      itens.map((i) => ({
        ticket_id: i.ticket_id,
        responsavel_email: i.responsavel_email,
        horas_planejadas: i.horas_planejadas,
      })),
      { inicio: sprint.inicio, fim: sprint.fim, folgas },
      nomePorEmail
    );
  }, [sprint, capacidade, itens, folgas, nomePorEmail]);

  const foraDoCapacity = useMemo(() => {
    const dentro = new Set(capacidade.map((c) => c.email.toLowerCase()));
    return pessoasTI.filter((p) => !dentro.has(p.email.toLowerCase()));
  }, [pessoasTI, capacidade]);

  async function definirCapacidade(email: string, horas_dia: number) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/capacidade`, {
      method: "PUT", body: JSON.stringify({ email, horas_dia }),
    })) carregar(sprintId);
  }

  async function tirarDoCapacity(email: string) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/capacidade?email=${encodeURIComponent(email)}`, { method: "DELETE" })) {
      carregar(sprintId);
    }
  }

  async function lancarFolga(campos: { data: string; ate: string | null; email: string | null; motivo: string }) {
    if (!sprintId) return false;
    const ok = await chamar(`/api/sprints/${sprintId}/folgas`, { method: "POST", body: JSON.stringify(campos) });
    if (ok) { setAviso("Folga lançada."); carregar(sprintId); }
    return ok;
  }

  async function tirarFolga(id: string) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/folgas?id=${id}`, { method: "DELETE" })) carregar(sprintId);
  }

  // ------------------------------------------------------------------ itens

  async function puxarParaSprint(t: Ticket) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/itens`, {
      method: "POST",
      body: JSON.stringify({
        ticket_id: t.id, responsavel_email: meuEmail, horas_planejadas: t.horas_estimadas ?? null,
      }),
    })) { setAviso(`#${t.numero ?? "—"} entrou na sprint.`); carregar(sprintId); }
  }

  async function mudarItem(ticketId: string, campos: Record<string, unknown>) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/itens`, {
      method: "PATCH", body: JSON.stringify({ ticket_id: ticketId, ...campos }),
    })) carregar(sprintId);
  }

  async function devolverAoBacklog(ticketId: string) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/${sprintId}/itens?ticket_id=${ticketId}`, { method: "DELETE" })) {
      setAviso("Cartão devolvido ao backlog.");
      setAberto(null);
      carregar(sprintId);
    }
  }

  /**
   * Muda o status pela rota de tickets que já existe — é ela que dispara a
   * notificação no Teams e fecha o `closed_at`. O board do setor de origem
   * lê o mesmo registro, então a mudança aparece lá sozinha.
   */
  async function mudarStatus(ticketId: string, status: string) {
    if (!sprintId) return;
    // Otimista: a coluna muda na hora e volta atrás se o servidor recusar.
    setItens((antes) => antes.map((i) =>
      i.ticket_id === ticketId && i.ticket ? { ...i, ticket: { ...i.ticket, status } } : i
    ));
    const ok = await chamar(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    carregar(sprintId);
    if (ok) setAviso(`Movido para ${STATUS_NOME[status] ?? status} — o setor de origem já vê.`);
  }

  // --------------------------------------------------------- apontamentos

  async function lancarHoras(ticketId: string, campos: { data: string; horas: string; comentario: string }) {
    if (!sprintId) return false;
    const ok = await chamar("/api/sprints/apontamentos", {
      method: "POST",
      body: JSON.stringify({
        ticket_id: ticketId, sprint_id: sprintId,
        data: campos.data, horas: campos.horas, comentario: campos.comentario,
      }),
    });
    if (ok) { setAviso("Horas lançadas."); carregar(sprintId); }
    return ok;
  }

  async function apagarApontamento(id: string) {
    if (!sprintId) return;
    if (await chamar(`/api/sprints/apontamentos?id=${id}`, { method: "DELETE" })) carregar(sprintId);
  }

  // ------------------------------------------------------------------ board

  const itensFiltrados = useMemo(
    () => (pessoaFiltro ? itens.filter((i) => i.responsavel_email === pessoaFiltro) : itens),
    [itens, pessoaFiltro]
  );

  const colunas = useMemo(
    () => STATUS.map((s) => ({
      ...s,
      itens: itensFiltrados.filter((i) => i.ticket?.status === s.id),
    })),
    [itensFiltrados]
  );

  const itemAberto = itens.find((i) => i.ticket_id === aberto) ?? null;

  if (!souDoTI) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">
        A sprint é o planejamento do time de Tecnologia. Se você precisa de acesso, fale com o TI.
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <select className={INPUT} value={sprintId ?? ""} onChange={(e) => setSprintId(e.target.value || null)}>
          {sprints.length === 0 && <option value="">Nenhuma sprint ainda</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome} · {dataCurta(s.inicio)}–{dataCurta(s.fim)} · {ESTADO_NOME[s.estado]}
            </option>
          ))}
        </select>

        {sprint && (
          <>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {dataBR(sprint.inicio)} a {dataBR(sprint.fim)} · {resumo.diasUteisSprint} dias úteis
            </span>
            {sprint.estado !== "ativa" && (
              <button className={BTN} disabled={salvando}
                      onClick={async () => {
                        if (await chamar(`/api/sprints/${sprint.id}`, { method: "PATCH", body: JSON.stringify({ estado: "ativa" }) })) {
                          setAviso("Sprint ativada."); carregar(sprint.id);
                        }
                      }}>Ativar</button>
            )}
            {sprint.estado === "ativa" && (
              <button className={BTN} disabled={salvando}
                      onClick={async () => {
                        if (await chamar(`/api/sprints/${sprint.id}`, { method: "PATCH", body: JSON.stringify({ estado: "encerrada" }) })) {
                          setAviso("Sprint encerrada."); carregar(sprint.id);
                        }
                      }}>Encerrar</button>
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
          {/* ---- abas ---- */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
            {([["board", "Board"], ["backlog", "Backlog"], ["capacidade", "Capacidade"], ["analytics", "Analytics"]] as [Aba, string][]).map(([id, nome]) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px transition ${
                  aba === id
                    ? "border-blue-600 text-slate-900 dark:text-white font-medium"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {nome}
                {id === "board" && itens.length > 0 && (
                  <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">{itens.length}</span>
                )}
              </button>
            ))}

            <div className="flex-1" />
            <div className="flex items-center gap-2 pb-1.5 text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white">{horasTexto(resumo.planejadoTotal)}</strong>
              de {horasTexto(resumo.capacidadeTotal)} ·
              <span className={resumo.livreTotal < 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-emerald-600 dark:text-emerald-400"}>
                {horasTexto(resumo.livreTotal)} livres
              </span>
            </div>
          </div>

          {carregando && <div className="text-sm text-slate-400 dark:text-slate-500 py-4">Carregando…</div>}

          {/* ================================================== BOARD ==== */}
          {aba === "board" && (
            <>
              <div className="flex items-center gap-2">
                <select className={`${INPUT} text-xs py-1.5`} value={pessoaFiltro} onChange={(e) => setPessoaFiltro(e.target.value)}>
                  <option value="">Todo o time</option>
                  {resumo.linhas.map((l) => (
                    <option key={l.email} value={l.email}>{l.nome ?? l.email}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Arraste o cartão entre as colunas — o status muda também no board do setor.
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {colunas.map((c) => (
                  <div
                    key={c.id}
                    className={`w-72 shrink-0 rounded-xl border p-2.5 transition ${
                      colunaSobre === c.id
                        ? "border-blue-400 bg-blue-50/60 dark:bg-blue-900/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setColunaSobre(c.id); }}
                    onDragLeave={() => setColunaSobre((v) => (v === c.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setColunaSobre(null);
                      const id = arrastando ?? e.dataTransfer.getData("text/plain");
                      setArrastando(null);
                      const item = itens.find((i) => i.ticket_id === id);
                      if (item && item.ticket?.status !== c.id) mudarStatus(id, c.id);
                    }}
                  >
                    <div className="flex items-center gap-2 px-1 pb-2 mb-1 border-b border-slate-200 dark:border-slate-800">
                      <span className={`w-2 h-2 rounded-full ${STATUS_COR[c.id]}`} />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.nome}</span>
                      <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{c.itens.length}</span>
                    </div>

                    <div className="space-y-2 min-h-[80px]">
                      {c.itens.length === 0 && (
                        <div className="text-xs text-slate-300 dark:text-slate-600 text-center py-5 italic">Nada aqui</div>
                      )}
                      {c.itens.map((i) => (
                        <CartaoBoard
                          key={i.ticket_id} item={i}
                          nomePorEmail={nomePorEmail}
                          encerrada={sprint.estado === "encerrada"}
                          onAbrir={() => setAberto(i.ticket_id)}
                          onArrastar={() => setArrastando(i.ticket_id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ============================================= CAPACIDADE ==== */}
          {aba === "capacidade" && (
            <PainelCapacidade
              resumo={resumo} folgas={folgas} pessoasTI={pessoasTI} foraDoCapacity={foraDoCapacity}
              salvando={salvando} sprint={sprint}
              onHorasDia={definirCapacidade} onTirarPessoa={tirarDoCapacity}
              onLancarFolga={lancarFolga} onTirarFolga={tirarFolga}
              nomePorEmail={nomePorEmail}
            />
          )}

          {/* ================================================ BACKLOG ==== */}
          {aba === "backlog" && (
            <PainelBacklog backlog={backlog} salvando={salvando} onPuxar={puxarParaSprint} />
          )}

          {/* ============================================== ANALYTICS ==== */}
          {aba === "analytics" && (
            <PainelAnalytics sprint={sprint} itens={itens} nomePorEmail={nomePorEmail} />
          )}
        </>
      )}

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

      {itemAberto && sprint && (
        <DetalheCartao
          item={itemAberto} meuEmail={meuEmail} pessoasTI={pessoasTI}
          nomePorEmail={nomePorEmail} salvando={salvando}
          encerrada={sprint.estado === "encerrada"}
          onFechar={() => setAberto(null)}
          onMudar={(campos) => mudarItem(itemAberto.ticket_id, campos)}
          onStatus={(st) => mudarStatus(itemAberto.ticket_id, st)}
          onLancar={(c) => lancarHoras(itemAberto.ticket_id, c)}
          onApagarApontamento={apagarApontamento}
          onDevolver={() => devolverAoBacklog(itemAberto.ticket_id)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------ cartão board

function CartaoBoard({
  item, nomePorEmail, encerrada, onAbrir, onArrastar,
}: {
  item: ItemSprint;
  nomePorEmail: Record<string, string>;
  encerrada: boolean;
  onAbrir: () => void;
  onArrastar: () => void;
}) {
  const t = item.ticket;
  const r = restante(item.horas_planejadas, item.horasApontadas);

  return (
    <div
      draggable={!encerrada}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", item.ticket_id); onArrastar(); }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800
                 rounded-lg p-2.5 cursor-pointer hover:border-blue-400 transition"
      onClick={onAbrir}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">#{t?.numero ?? "—"}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          {t ? (SETOR_NOME[t.sector] ?? t.sector) : "—"}
        </span>
      </div>

      <div className="text-sm font-medium text-slate-900 dark:text-white leading-snug line-clamp-2 mb-2">
        {t?.title ?? "Cartão removido"}
      </div>

      {r.estimate > 0 && (
        <div className="mb-2">
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${r.estourou ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${r.pct}%` }} />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {horasEmTexto(r.feito)} de {horasEmTexto(r.estimate)} ·{" "}
            <span className={r.estourou ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
              {r.estourou ? `${horasEmTexto(r.feito - r.estimate)} além` : `faltam ${horasEmTexto(r.falta)}`}
            </span>
          </div>
        </div>
      )}
      {r.estimate === 0 && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">Sem estimate</div>
      )}

      <div className="flex items-center gap-1.5">
        {item.responsavel_email ? (
          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-semibold
                           text-slate-600 dark:text-slate-300 flex items-center justify-center"
                title={nomePorEmail[item.responsavel_email] ?? item.responsavel_email}>
            {iniciais(nomePorEmail[item.responsavel_email] ?? null, item.responsavel_email)}
          </span>
        ) : (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">sem dono</span>
        )}

        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
          {item.apontamentos.length > 0
            ? `${item.apontamentos.length} apontamento(s)`
            : encerrada ? "" : "sem apontamento"}
        </span>
      </div>
    </div>
  );
}

// -------------------------------------------------------- painel capacidade

function PainelCapacidade({
  resumo, folgas, pessoasTI, foraDoCapacity, salvando, sprint,
  onHorasDia, onTirarPessoa, onLancarFolga, onTirarFolga, nomePorEmail,
}: {
  resumo: ReturnType<typeof resumoCapacidade>;
  folgas: Folga[];
  pessoasTI: PessoaTickets[];
  foraDoCapacity: PessoaTickets[];
  salvando: boolean;
  sprint: Sprint;
  onHorasDia: (email: string, horas: number) => void;
  onTirarPessoa: (email: string) => void;
  onLancarFolga: (c: { data: string; ate: string | null; email: string | null; motivo: string }) => Promise<boolean>;
  onTirarFolga: (id: string) => void;
  nomePorEmail: Record<string, string>;
}) {
  const [de, setDe] = useState(sprint.inicio);
  const [ate, setAte] = useState("");
  const [quem, setQuem] = useState("");
  const [motivo, setMotivo] = useState("");

  const feriados = folgas.filter((f) => !f.email);
  const ausencias = folgas.filter((f) => f.email);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* --- pessoas --- */}
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Capacidade por pessoa</h3>

        {resumo.linhas.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-3">
            Ninguém no capacity ainda.
          </p>
        )}

        <div className="space-y-3">
          {resumo.linhas.map((l) => (
            <LinhaPessoa key={l.email} l={l} salvando={salvando}
                         onHoras={(h) => onHorasDia(l.email, h)} onTirar={() => onTirarPessoa(l.email)} />
          ))}
        </div>

        {resumo.semResponsavel.itens > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {resumo.semResponsavel.itens} cartão(ões) sem dono somam {horasTexto(resumo.semResponsavel.horas)} —
            pesam na sprint, mas não estão na conta de ninguém.
          </p>
        )}

        {foraDoCapacity.length > 0 && (
          <select className={`${INPUT} text-xs mt-3`} defaultValue=""
                  onChange={(e) => { if (e.target.value) { onHorasDia(e.target.value, 6); e.target.value = ""; } }}>
            <option value="">+ Adicionar pessoa (entra com 6 h/dia)…</option>
            {foraDoCapacity.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* --- folgas --- */}
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Dias off da sprint</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Feriado tira o dia do time inteiro. Escolhendo uma pessoa, vira férias ou ausência
          só dela. Fim de semana já está fora da conta.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="block">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">De</span>
            <input type="date" className={`${INPUT} w-full mt-0.5 text-xs`} value={de}
                   min={sprint.inicio} max={sprint.fim} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Até (opcional)</span>
            <input type="date" className={`${INPUT} w-full mt-0.5 text-xs`} value={ate}
                   min={de} max={sprint.fim} onChange={(e) => setAte(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <select className={`${INPUT} text-xs`} value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="">Feriado (time todo)</option>
            {pessoasTI.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          </select>
          <input className={`${INPUT} text-xs`} placeholder="Motivo (opcional)"
                 value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>

        <button className={BTN} disabled={salvando || !de}
                onClick={async () => {
                  if (await onLancarFolga({ data: de, ate: ate || null, email: quem || null, motivo })) {
                    setAte(""); setMotivo("");
                  }
                }}>
          Lançar folga
        </button>

        {feriados.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Feriados do time
            </div>
            <div className="flex flex-wrap gap-1.5">
              {feriados.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded
                                            bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300
                                            border border-amber-200 dark:border-amber-800">
                  {dataCurta(f.data)}{f.motivo ? ` · ${f.motivo}` : ""}
                  <button className="hover:text-red-600" disabled={salvando} onClick={() => onTirarFolga(f.id)}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {ausencias.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Ausências
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ausencias.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded
                                            bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
                                            border border-slate-200 dark:border-slate-700">
                  {primeiroNome(nomePorEmail[f.email ?? ""] ?? null, f.email ?? "")} · {dataCurta(f.data)}
                  {f.motivo ? ` · ${f.motivo}` : ""}
                  <button className="hover:text-red-600" disabled={salvando} onClick={() => onTirarFolga(f.id)}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {folgas.length === 0 && (
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 italic">
            Nenhuma folga lançada — a sprint tem {resumo.diasUteisSprint} dias úteis cheios.
          </p>
        )}
      </div>
    </div>
  );
}

function LinhaPessoa({
  l, salvando, onHoras, onTirar,
}: {
  l: LinhaCapacidade;
  salvando: boolean;
  onHoras: (h: number) => void;
  onTirar: () => void;
}) {
  const [hd, setHd] = useState(String(l.horasDia));
  useEffect(() => { setHd(String(l.horasDia)); }, [l.horasDia]);
  const pct = Math.min(100, Math.max(0, l.ocupacao));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold
                         text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
          {iniciais(l.nome, l.email)}
        </span>
        <span className="text-sm text-slate-800 dark:text-slate-200 truncate flex-1">{l.nome ?? l.email}</span>
        <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <input className={`${INPUT} w-14 px-2 py-1 text-xs`} inputMode="decimal" value={hd} disabled={salvando}
                 onChange={(e) => setHd(e.target.value)}
                 onBlur={() => { const n = Number(hd.replace(",", ".")); if (Number.isFinite(n) && n !== l.horasDia) onHoras(n); }} />
          h/dia
        </label>
        <button className="text-slate-300 hover:text-red-500 dark:text-slate-600 text-sm" disabled={salvando}
                title="Tirar do capacity" onClick={onTirar}>✕</button>
      </div>

      <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${l.estourou ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-emerald-500"}`}
             style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
        {horasTexto(l.planejado)} de {horasTexto(l.capacidade)} · {l.diasTrabalhados} dias
        {l.diasFora > 0 && <span className="text-amber-600 dark:text-amber-400"> ({l.diasFora} fora)</span>}
        {" · "}
        <span className={l.livre < 0 ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
          {l.livre < 0 ? `${horasTexto(Math.abs(l.livre))} além` : `${horasTexto(l.livre)} livres`}
        </span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- painel backlog

function PainelBacklog({
  backlog, salvando, onPuxar,
}: {
  backlog: Ticket[];
  salvando: boolean;
  onPuxar: (t: Ticket) => void;
}) {
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return backlog.filter((t) => {
      if (setor && t.sector !== setor) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || String(t.numero ?? "").includes(q)
        || (t.description ?? "").toLowerCase().includes(q);
    });
  }, [backlog, busca, setor]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input className={`${INPUT} flex-1`} placeholder="Buscar por número, título ou descrição…"
               value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className={INPUT} value={setor} onChange={(e) => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {SETORES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <span className="flex items-center text-xs text-slate-400 dark:text-slate-500 px-1">
          {lista.length} de {backlog.length}
        </span>
      </div>

      <div className="space-y-2">
        {lista.length === 0 && (
          <div className={`${CARD} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>
            Nada em aberto fora das sprints.
          </div>
        )}
        {lista.map((t) => (
          <div key={t.id} className={`${CARD} p-3 flex items-start gap-3`}>
            <span className="text-xs font-mono text-slate-400 dark:text-slate-500 pt-0.5 shrink-0">#{t.numero ?? "—"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {SETOR_NOME[t.sector] ?? t.sector} · {STATUS_NOME[t.status] ?? t.status}
                {t.horas_estimadas ? ` · ${horasTexto(Number(t.horas_estimadas))} estimadas` : ""}
              </div>
            </div>
            <button className={BTN} disabled={salvando} onClick={() => onPuxar(t)}>Puxar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- detalhe cartão

function DetalheCartao({
  item, meuEmail, pessoasTI, nomePorEmail, salvando, encerrada,
  onFechar, onMudar, onStatus, onLancar, onApagarApontamento, onDevolver,
}: {
  item: ItemSprint;
  meuEmail: string | null;
  pessoasTI: PessoaTickets[];
  nomePorEmail: Record<string, string>;
  salvando: boolean;
  encerrada: boolean;
  onFechar: () => void;
  onMudar: (campos: Record<string, unknown>) => void;
  onStatus: (st: string) => void;
  onLancar: (c: { data: string; horas: string; comentario: string }) => Promise<boolean>;
  onApagarApontamento: (id: string) => void;
  onDevolver: () => void;
}) {
  const t = item.ticket;
  const [estimate, setEstimate] = useState(item.horas_planejadas != null ? String(item.horas_planejadas) : "");
  const [data, setData] = useState(hoje());
  const [horas, setHoras] = useState("");
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    setEstimate(item.horas_planejadas != null ? String(item.horas_planejadas) : "");
  }, [item.horas_planejadas]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onFechar]);

  const r = restante(item.horas_planejadas, item.horasApontadas);

  // Regra do time: o cartão não estoura. Sem estimate não há teto, e com o
  // teto atingido só resta aumentar a estimativa ou abrir outro cartão.
  const semSaldo = r.estimate > 0 && r.falta <= 0;
  const bloqueado = r.estimate <= 0 || semSaldo;
  const pedido = Number((horas ?? "").replace(",", ".")) || 0;
  const passaDoTeto = pedido > r.falta + 0.001;

  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of item.apontamentos) {
      m.set(a.data, (m.get(a.data) ?? 0) + a.horas);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [item.apontamentos]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>

        {/* cabeçalho */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span className="font-mono">#{t?.numero ?? "—"}</span>
              {" · "}{t ? (SETOR_NOME[t.sector] ?? t.sector) : "—"}
              {t?.created_by_email ? ` · pedido por ${primeiroNome(t.created_by_name, t.created_by_email)}` : ""}
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t?.title ?? "Cartão removido"}</h2>
          </div>
          <button className={BTN} onClick={onFechar}>✕</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* controles */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">Status</label>
            <select className={`${INPUT} text-sm py-1.5`} value={t?.status ?? ""} disabled={salvando}
                    onChange={(e) => onStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>

            <label className="text-xs text-slate-500 dark:text-slate-400 ml-2">Responsável</label>
            <select className={`${INPUT} text-sm py-1.5`} value={item.responsavel_email ?? ""}
                    disabled={salvando || encerrada}
                    onChange={(e) => onMudar({ responsavel_email: e.target.value || null })}>
              <option value="">Sem dono</option>
              {pessoasTI.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
            </select>

            <div className="flex-1" />
            <button className={BTN} disabled={salvando || encerrada} onClick={onDevolver}
                    title="Tirar da sprint (o cartão volta ao board do setor)">
              Devolver ao backlog
            </button>
          </div>

          {/* esforço */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Esforço (horas)</h3>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Estimate</span>
                <input className={`${INPUT} w-full mt-1`} inputMode="decimal" value={estimate}
                       disabled={salvando || encerrada}
                       onChange={(e) => setEstimate(e.target.value)}
                       onBlur={() => {
                         const bruto = estimate.trim();
                         const n = bruto === "" ? null : Number(bruto.replace(",", "."));
                         if (n === null || Number.isFinite(n)) onMudar({ horas_planejadas: bruto === "" ? "" : n });
                       }} />
              </label>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Lançado</span>
                <div className={`${INPUT} mt-1 ${r.estourou ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>
                  {horasEmTexto(r.feito)}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Restante</span>
                <div className={`${INPUT} mt-1 ${r.estourou ? "text-red-600 dark:text-red-400" : ""}`}>
                  {r.estourou ? `${horasEmTexto(r.feito - r.estimate)} além` : horasEmTexto(r.falta)}
                </div>
              </div>
            </div>

            {r.estimate > 0 && (
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                <div className={`h-full rounded-full ${r.estourou ? "bg-red-500" : "bg-blue-500"}`}
                     style={{ width: `${r.pct}%` }} />
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              O restante cai sozinho conforme as horas são lançadas abaixo.
              O cartão <strong>não passa do Estimate</strong>: se o trabalho render mais, aumente a
              estimativa ou abra outro cartão.
            </p>
          </div>

          {/* lançar horas */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lançar horas</h3>
              {r.estimate > 0 && (
                <span className={`text-xs ${semSaldo ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
                  {semSaldo ? "cartão cheio" : `cabem mais ${horasEmTexto(r.falta)}`}
                </span>
              )}
            </div>

            {r.estimate <= 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                Defina o Estimate acima antes de lançar horas — sem teto não dá para saber o que é estouro.
              </p>
            )}
            {semSaldo && (
              <p className="text-xs text-red-700 dark:text-red-400 mb-2">
                As {horasEmTexto(r.estimate)} previstas já foram usadas. Aumente o Estimate se o escopo
                cresceu, ou abra outro cartão para o que falta.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Data</span>
                <input type="date" className={`${INPUT} mt-1`} value={data} onChange={(e) => setData(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Horas</span>
                <input className={`${INPUT} w-20 mt-1`} inputMode="decimal"
                       placeholder={r.falta > 0 ? String(r.falta) : "0"}
                       disabled={bloqueado}
                       value={horas} onChange={(e) => setHoras(e.target.value)} />
              </label>
              <label className="block flex-1 min-w-[180px]">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Comentário (opcional)</span>
                <input className={`${INPUT} w-full mt-1`} value={comentario} disabled={bloqueado}
                       onChange={(e) => setComentario(e.target.value)} placeholder="O que foi feito" />
              </label>
              <button className={BTN_PRIMARY} disabled={salvando || bloqueado || !horas.trim() || passaDoTeto}
                      onClick={async () => {
                        if (await onLancar({ data, horas, comentario })) { setHoras(""); setComentario(""); }
                      }}>
                Lançar
              </button>
            </div>

            {!bloqueado && passaDoTeto && (
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                Cabem só {horasEmTexto(r.falta)} neste cartão. Lance até esse limite e abra outro
                cartão para o excedente.
              </p>
            )}
          </div>

          {/* apontamentos */}
          <div className="grid md:grid-cols-[220px_1fr] gap-4">
            <div className={`${CARD} p-3`}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Dias com apontamento
              </div>
              {porDia.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum ainda.</p>
              )}
              <div className="space-y-1">
                {porDia.map(([d, h]) => (
                  <div key={d} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">{dataBR(d)}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{horasEmTexto(h)}</span>
                  </div>
                ))}
              </div>
              {porDia.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total</span>
                  <strong className="text-slate-900 dark:text-white">{horasEmTexto(item.horasApontadas)}</strong>
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Apontamentos ({item.apontamentos.length})
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {item.apontamentos.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                    Nenhuma hora lançada neste cartão.
                  </p>
                )}
                {item.apontamentos.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded
                                             bg-slate-50 dark:bg-slate-800/50">
                    <span className="w-16 shrink-0 text-slate-600 dark:text-slate-300">{dataCurta(a.data)}</span>
                    <span className="w-16 shrink-0 font-medium text-slate-900 dark:text-white">{horasEmTexto(a.horas)}</span>
                    <span className="w-24 shrink-0 truncate text-slate-500 dark:text-slate-400">
                      {primeiroNome(nomePorEmail[a.email] ?? null, a.email)}
                    </span>
                    <span className="flex-1 truncate text-slate-500 dark:text-slate-400">
                      {a.comentario ?? ""}
                    </span>
                    {(a.email === meuEmail) && (
                      <button className="text-slate-300 hover:text-red-500 dark:text-slate-600 shrink-0"
                              title="Apagar lançamento" disabled={salvando}
                              onClick={() => onApagarApontamento(a.id)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {t?.description && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Descrição</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{t.description}</p>
            </div>
          )}
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
                   placeholder="Ex.: Sprint 02 · outubro" autoFocus />
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
            {dias} dias úteis. Feriados e férias entram depois, na aba Capacidade.
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

// --------------------------------------------------------- painel analytics

/**
 * Burndown em SVG puro.
 *
 * Sem biblioteca de gráfico: são duas linhas e umas barras, e uma dependência
 * nova custaria mais do que o desenho. O eixo Y usa o maior valor entre o
 * total e o pico da linha real, para escopo que entrou no meio não sair da
 * área visível.
 */
function GraficoBurndown({ pontos }: { pontos: PontoBurndown[] }) {
  if (pontos.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500 italic">Sprint sem dias úteis.</p>;
  }

  const L = 44, T = 12, R = 12, B = 34;
  const W = 720, H = 240;
  const areaW = W - L - R;
  const areaH = H - T - B;

  const maxVal = Math.max(
    1,
    ...pontos.map((p) => p.ideal),
    ...pontos.map((p) => p.real ?? 0),
    ...pontos.map((p) => p.lancado)
  );
  const topo = Math.ceil(maxVal / 4) * 4 || 4;

  const x = (i: number) => L + (pontos.length === 1 ? areaW / 2 : (areaW * i) / (pontos.length - 1));
  const y = (v: number) => T + areaH - (areaH * v) / topo;

  const reais = pontos.map((p, i) => ({ i, v: p.real })).filter((p) => p.v !== null) as { i: number; v: number }[];
  const linha = (pts: { i: number; v: number }[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const larguraBarra = Math.max(4, Math.min(22, areaW / pontos.length - 6));

  const grade = [0, 0.25, 0.5, 0.75, 1].map((f) => topo * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Burndown da sprint">
      {grade.map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)}
                className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500" fontSize="9">
            {Math.round(v)}
          </text>
        </g>
      ))}

      {/* horas lançadas no dia */}
      {pontos.map((p, i) => p.lancado > 0 && (
        <rect key={`b${p.data}`} x={x(i) - larguraBarra / 2} y={y(p.lancado)}
              width={larguraBarra} height={Math.max(0, y(0) - y(p.lancado))}
              className="fill-blue-200 dark:fill-blue-900/60" rx="2" />
      ))}

      {/* linha ideal */}
      <path d={linha(pontos.map((p, i) => ({ i, v: p.ideal })))}
            fill="none" strokeDasharray="5 4" strokeWidth="1.5"
            className="stroke-slate-400 dark:stroke-slate-600" />

      {/* linha real */}
      {reais.length > 0 && (
        <>
          <path d={linha(reais)} fill="none" strokeWidth="2.5"
                className="stroke-emerald-500" strokeLinejoin="round" strokeLinecap="round" />
          {reais.map((p) => (
            <circle key={`p${p.i}`} cx={x(p.i)} cy={y(p.v)} r="3" className="fill-emerald-500" />
          ))}
        </>
      )}

      {/* datas */}
      {pontos.map((p, i) => {
        const cada = Math.ceil(pontos.length / 8);
        if (i % cada !== 0 && i !== pontos.length - 1) return null;
        return (
          <text key={`d${p.data}`} x={x(i)} y={H - 12} textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500" fontSize="9">
            {p.data.slice(8, 10)}/{p.data.slice(5, 7)}
          </text>
        );
      })}
    </svg>
  );
}

function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PainelAnalytics({
  sprint, itens, nomePorEmail,
}: {
  sprint: Sprint;
  itens: ItemSprint[];
  nomePorEmail: Record<string, string>;
}) {
  const totalEstimado = useMemo(
    () => itens.reduce((s, i) => s + (Number(i.horas_planejadas) || 0), 0),
    [itens]
  );

  const lancamentosPorDia = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of itens) {
      for (const a of i.apontamentos) {
        m[a.data] = (m[a.data] ?? 0) + a.horas;
      }
    }
    return m;
  }, [itens]);

  const pontos = useMemo(
    () => burndown(sprint.inicio, sprint.fim, totalEstimado, lancamentosPorDia, hoje()),
    [sprint.inicio, sprint.fim, totalEstimado, lancamentosPorDia]
  );

  const a: Analytics = useMemo(
    () => analytics(
      itens.map((i) => ({
        ticket_id: i.ticket_id,
        numero: i.ticket?.numero ?? null,
        titulo: i.ticket?.title ?? "—",
        status: i.ticket?.status ?? "backlog",
        setor: i.ticket?.sector ?? "—",
        responsavel_email: i.responsavel_email,
        estimate: i.horas_planejadas,
        lancado: i.horasApontadas,
      })),
      STATUS_NOME, SETOR_NOME, nomePorEmail
    ),
    [itens, nomePorEmail]
  );

  const ultimo = [...pontos].reverse().find((p) => p.real !== null);
  const falta = ultimo?.real ?? totalEstimado;
  const noRitmo = ultimo ? falta <= ultimo.ideal : true;

  const maxPessoa = Math.max(1, ...a.porPessoa.map((p) => Math.max(p.planejado, p.lancado)));
  const maxSetor = Math.max(1, ...a.porSetor.map((s) => s.qtd));

  if (itens.length === 0) {
    return (
      <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
        Sprint sem cartões — nada para medir ainda.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* números do topo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={`${CARD} p-3`}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Planejado</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">{horasTexto(a.totalEstimado)}</div>
        </div>
        <div className={`${CARD} p-3`}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Lançado</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">{horasTexto(a.totalLancado)}</div>
        </div>
        <div className={`${CARD} p-3`}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Falta</div>
          <div className={`text-lg font-bold ${noRitmo ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {horasTexto(falta)}
          </div>
        </div>
        <div className={`${CARD} p-3`}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Cartões fechados</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">{a.fechados}/{a.cartoes}</div>
        </div>
        <div className={`${CARD} p-3`}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400" title="Média do quanto os cartões fechados consumiram do próprio estimate">
            Precisão da estimativa
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {a.consumoMedioFechados === null ? "—" : `${a.consumoMedioFechados}%`}
          </div>
        </div>
      </div>

      {/* burndown */}
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Burndown</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-4 border-t-2 border-dashed border-slate-400" /> Ideal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 border-t-2 border-emerald-500" /> Restante real
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-200 dark:bg-blue-900" /> Lançado no dia
            </span>
          </div>
        </div>

        <GraficoBurndown pontos={pontos} />

        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          {noRitmo
            ? "A linha real está no ritmo da guia ou abaixo dela."
            : "A linha real está acima da guia — no ritmo de hoje, a sprint não fecha o planejado."}
          {" "}Cartão puxado no meio da sprint levanta a linha, porque é escopo novo.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* por pessoa */}
        <div className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Planejado × lançado por pessoa</h3>
          {a.porPessoa.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum cartão com dono.</p>
          )}
          <div className="space-y-3">
            {a.porPessoa.map((p) => (
              <div key={p.email}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-700 dark:text-slate-300">{p.nome ?? p.email}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {horasTexto(p.lancado)} de {horasTexto(p.planejado)}
                  </span>
                </div>
                <div className="space-y-1">
                  <Barra valor={p.planejado} maximo={maxPessoa} cor="bg-slate-300 dark:bg-slate-700" />
                  <Barra valor={p.lancado} maximo={maxPessoa} cor="bg-emerald-500" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* por setor de origem */}
        <div className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">De onde vieram os cartões</h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
            Quanto do tempo do TI cada setor consumiu nesta sprint.
          </p>
          <div className="space-y-2.5">
            {a.porSetor.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-700 dark:text-slate-300">{s.nome}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {s.qtd} cartão(ões) · {horasTexto(s.horas)}
                  </span>
                </div>
                <Barra valor={s.qtd} maximo={maxSetor} cor="bg-blue-500" />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Por status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.porStatus.map((st) => (
                <span key={st.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded
                                             bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COR[st.id] ?? "bg-slate-400"}`} />
                  {st.nome} {st.qtd}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* precisão por cartão */}
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Estimativa × realizado</h3>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          Ordenado pelo maior desvio — é onde a estimativa mais errou, para bom e para ruim.
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {a.precisao.map((l) => (
            <div key={l.ticket_id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded
                                              bg-slate-50 dark:bg-slate-800/50">
              <span className="w-12 shrink-0 font-mono text-slate-400 dark:text-slate-500">#{l.numero ?? "—"}</span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{l.titulo}</span>
              <span className="w-28 shrink-0 text-right text-slate-500 dark:text-slate-400">
                {horasEmTexto(l.lancado)} / {horasEmTexto(l.estimate)}
              </span>
              <span className={`w-20 shrink-0 text-right font-medium ${
                l.desvio < 0 ? "text-red-600 dark:text-red-400"
                : l.desvio > 0 ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-400 dark:text-slate-500"
              }`}>
                {l.desvio === 0 ? "no ponto" : l.desvio > 0 ? `sobrou ${horasEmTexto(l.desvio)}` : `faltou ${horasEmTexto(-l.desvio)}`}
              </span>
              {l.fechado && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Cartão fechado" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
