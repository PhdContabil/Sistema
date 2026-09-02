"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS, PRIORIDADES, PRIORIDADE_NOME, SETOR_NOME,
  iniciais, primeiroNome, tempoRelativo,
  formatHoras, formatReais, desvioHoras, mesesRetorno,
  type Ticket, type Comentario, type Anexo, type Responsavel, type PessoaTickets,
} from "@/lib/tickets";

interface Detalhe {
  ticket: Ticket;
  comentarios: Comentario[];
  anexos: Anexo[];
  responsaveis: Responsavel[];
}

// Visual do módulo de Tickets, no estilo do sistema antigo — segue o mesmo
// interruptor claro/escuro do resto do Núcleo Contábil (ver tailwind.config.ts).
export const INPUT =
  "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-blue-500";
export const BTN =
  "px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed";
export const BTN_PRIMARY =
  "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
export const CARD = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg";

// Mesmas cores do sistema de tickets antigo (src/lib/types.ts).
const PRIORIDADE_COR: Record<string, string> = {
  baixa: "bg-slate-500",
  media: "bg-green-600",
  alta: "bg-red-600",
};

const STATUS_COR: Record<string, string> = {
  backlog: "bg-slate-400 dark:bg-slate-500",
  analise: "bg-blue-500",
  desenvolvimento: "bg-purple-500",
  operacao_assistida: "bg-amber-500",
  finalizado: "bg-emerald-500",
};

// Pra quem além de TI pode ser atribuído em cada setor — pedido do Pedro
// pra não listar mais "todo mundo de todos os setores" no seletor, só o(s)
// ponto(s) de contato de cada área. Casa por nome (contém), sem acento nem
// caixa, então funciona com o nome como está cadastrado em ticket_users.
const LIGACAO_POR_SETOR: Record<string, string[]> = {
  fiscal: ["giovanna"],
  trabalhista: ["gean"],
  contabil: ["maisa"],
};

function pessoasAtribuiveis(pessoas: PessoaTickets[], setorTicket: string, jaAtribuidos: string[] = []) {
  const livres = pessoas.filter(
    (p) => !jaAtribuidos.some((e) => e.toLowerCase() === p.email.toLowerCase())
  );
  const ti = livres.filter((p) => p.sector === "ti");
  const nomesLigacao = LIGACAO_POR_SETOR[setorTicket] ?? [];
  const ligacao = livres.filter(
    (p) => p.sector === setorTicket && nomesLigacao.some((n) => p.name.toLowerCase().includes(n))
  );
  return { ti, ligacao };
}

export default function TicketsBoard({
  setor, tickets, meuEmail, pessoas, souAdmin, souAdminGeral, souVejoMedicao, erroServidor,
}: {
  setor: string;
  tickets: Ticket[];
  meuEmail: string | null;
  pessoas: PessoaTickets[];
  souAdmin: boolean;
  /** Admin pleno — só ele vê o filtro de prioridade e edita a prioridade do ticket. */
  souAdminGeral: boolean;
  /** T.I. + Junior + EdCarlos — só eles veem/editam horas e ganho no detalhe. */
  souVejoMedicao: boolean;
  erroServidor: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [aberto, setAberto] = useState<Detalhe | null>(null);
  const [novo, setNovo] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tickets.filter((t) => {
      if (prioridade && t.priority !== prioridade) return false;
      if (soMeus && meuEmail) {
        const meu = t.responsaveis.some((r) => r.user_email.toLowerCase() === meuEmail)
          || t.created_by_email.toLowerCase() === meuEmail;
        if (!meu) return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.created_by_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [tickets, busca, prioridade, soMeus, meuEmail]);

  // Todas as colunas aparecem sempre, Finalizado incluso — igual ao sistema antigo.
  const colunas = useMemo(
    () => STATUS.map((s) => ({ ...s, itens: filtrados.filter((t) => t.status === s.id) })),
    [filtrados]
  );

  async function abrir(id: string) {
    setCarregando(true);
    try {
      const r = await fetch(`/api/tickets/${id}`, { cache: "no-store" });
      if (r.ok) setAberto(await r.json());
    } finally {
      setCarregando(false);
    }
  }

  const abertosNoSetor = tickets.filter((t) => t.status !== "finalizado").length;

  // Soma apenas do que está na tela, para acompanhar o filtro em vigor.
  const totalGanho = filtrados.reduce((s, t) => s + (t.ganho_mensal ?? 0), 0);
  const totalHorasMes = filtrados.reduce((s, t) => s + (t.ganho_horas_mes ?? 0), 0);
  const totalRealizadas = filtrados.reduce((s, t) => s + (t.horas_realizadas ?? 0), 0);

  return (
    <>
      {erroServidor && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">
          {erroServidor}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-bold mr-1">{SETOR_NOME[setor] ?? setor}</h2>
        <input
          className={`${INPUT} flex-1 min-w-[200px]`}
          placeholder="Buscar por título, descrição ou autor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {souAdminGeral && (
          <select className={INPUT} value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="">Toda prioridade</option>
            {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        <button
          onClick={() => setSoMeus((v) => !v)}
          className={`px-3 py-2 rounded-lg text-sm border transition ${
            soMeus
              ? "bg-blue-600 border-blue-600 text-white"
              : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Meus
        </button>
        <button className={BTN_PRIMARY} onClick={() => setNovo(true)}>+ Novo ticket</button>
        <span className="text-xs text-slate-500 dark:text-slate-500 ml-auto whitespace-nowrap">
          {filtrados.length} de {tickets.length} · {abertosNoSetor} em aberto
        </span>
      </div>

      {souVejoMedicao && (totalGanho > 0 || totalRealizadas > 0) && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className={`${CARD} px-4 py-2.5`}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Horas realizadas</div>
            <div className="text-lg font-semibold">{formatHoras(totalRealizadas)}</div>
          </div>
          <div className={`${CARD} px-4 py-2.5`}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Ganho de tempo</div>
            <div className="text-lg font-semibold">
              {formatHoras(totalHorasMes)}<span className="text-xs font-normal text-slate-400"> /mês</span>
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-900 rounded-lg px-4 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-500">Ganho mensal</div>
            <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatReais(totalGanho)}</div>
            <div className="text-[11px] text-emerald-600">{filtrados.length} tickets em tela</div>
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {colunas.map((c) => (
          <div
            key={c.id}
            className="w-72 shrink-0 bg-slate-100/70 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[72vh]"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COR[c.id] ?? "bg-slate-500"}`} />
              <h3 className="font-semibold text-sm flex-1">{c.nome}</h3>
              <span className="text-xs text-slate-500">{c.itens.length}</span>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto flex-1">
              {c.itens.map((t) => (
                <button
                  key={t.id}
                  onClick={() => abrir(t.id)}
                  className="w-full text-left bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 transition shadow-sm dark:shadow-none"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] text-white ${PRIORIDADE_COR[t.priority] ?? "bg-slate-500"}`}>
                      {PRIORIDADE_NOME[t.priority]}
                    </span>
                    {t.ganho_mensal ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400" title="Ganho mensal estimado">
                        {formatReais(t.ganho_mensal)}/mês
                      </span>
                    ) : null}
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">{tempoRelativo(t.created_at)}</span>
                  </div>
                  <div className="text-sm font-medium leading-snug mb-1">{t.title}</div>
                  {t.description && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug mb-2 line-clamp-2 whitespace-pre-line">
                      {t.description}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
                    <span className="truncate">{primeiroNome(t.created_by_name, t.created_by_email)}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {t.qtdComentarios > 0 && <span title="comentários">💬 {t.qtdComentarios}</span>}
                      {t.qtdAnexos > 0 && <span title="anexos">📎 {t.qtdAnexos}</span>}
                      <span className="flex -space-x-1.5">
                        {t.responsaveis.map((r) => (
                          <span
                            key={r.user_email}
                            title={r.user_name ?? r.user_email}
                            className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 border border-white dark:border-slate-900 text-[9px] flex items-center justify-center font-semibold text-slate-700 dark:text-slate-200"
                          >
                            {iniciais(r.user_name, r.user_email)}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
              {c.itens.length === 0 && <div className="text-slate-400 dark:text-slate-600 text-xs italic px-1 py-2">Nada aqui</div>}
            </div>
          </div>
        ))}
      </div>

      {carregando && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-lg px-4 py-2 shadow-xl z-50">
          Abrindo…
        </div>
      )}

      {aberto && (
        <DetalheTicket
          d={aberto}
          meuEmail={meuEmail}
          pessoas={pessoas}
          souAdmin={souAdmin}
          souAdminGeral={souAdminGeral}
          souVejoMedicao={souVejoMedicao}
          onFechar={() => setAberto(null)}
          onMudou={() => { setAberto(null); router.refresh(); }}
        />
      )}

      {novo && (
        <NovoTicket
          setor={setor}
          pessoas={pessoas}
          onFechar={() => setNovo(false)}
          onCriado={() => { setNovo(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------ detalhe

function DetalheTicket({
  d, meuEmail, pessoas, souAdmin, souAdminGeral, souVejoMedicao, onFechar, onMudou,
}: {
  d: Detalhe;
  meuEmail: string | null;
  pessoas: PessoaTickets[];
  souAdmin: boolean;
  souAdminGeral: boolean;
  souVejoMedicao: boolean;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [t, setT] = useState(d.ticket);
  const [comentarios, setComentarios] = useState(d.comentarios);
  const [responsaveis, setResponsaveis] = useState(d.responsaveis);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const souResponsavel = !!meuEmail && responsaveis.some((r) => r.user_email.toLowerCase() === meuEmail);
  const desvio = desvioHoras(t);
  const retorno = mesesRetorno(t);

  async function patch(corpo: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
      return true;
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(status: string) {
    if (await patch({ status })) setT({ ...t, status });
  }
  async function mudarPrioridade(priority: string) {
    if (await patch({ priority })) setT({ ...t, priority });
  }
  async function alternarResponsavel() {
    const ok = await patch(souResponsavel ? { remover: true } : { assumir: true });
    if (!ok || !meuEmail) return;
    setResponsaveis(souResponsavel
      ? responsaveis.filter((r) => r.user_email.toLowerCase() !== meuEmail)
      : [...responsaveis, { user_email: meuEmail, user_name: null }]);
  }

  async function atribuirPessoa(email: string) {
    if (!email) return;
    if (responsaveis.some((r) => r.user_email.toLowerCase() === email.toLowerCase())) return;
    if (await patch({ atribuir: email })) {
      const p = pessoas.find((x) => x.email.toLowerCase() === email.toLowerCase());
      setResponsaveis([...responsaveis, { user_email: email, user_name: p?.name ?? null }]);
    }
  }

  async function tirarPessoa(email: string) {
    if (await patch({ desatribuir: email })) {
      setResponsaveis(responsaveis.filter((r) => r.user_email.toLowerCase() !== email.toLowerCase()));
    }
  }

  /** Salva um campo de medição no blur, para não bater no servidor a cada tecla. */
  async function salvarMedicao(campo: keyof typeof t, valor: string) {
    const limpo = valor.trim();
    const enviar = limpo === "" ? null : limpo;
    if (await patch({ [campo]: enviar })) {
      const n = limpo === "" ? null : Number(limpo.replace(",", "."));
      const novo = { ...t, [campo]: n } as Ticket;
      // ganho mensal é derivado: espelha aqui o que o banco calcula
      novo.ganho_mensal =
        novo.ganho_horas_mes && novo.valor_hora
          ? Math.round(novo.ganho_horas_mes * novo.valor_hora * 100) / 100
          : null;
      setT(novo);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o ticket "${t.title}"? Essa ação não pode ser desfeita.`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/${t.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível excluir."); return; }
      onMudou();
    } finally {
      setSalvando(false);
    }
  }

  async function comentar() {
    const corpo = texto.trim();
    if (!corpo) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/${t.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: corpo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível comentar."); return; }
      if (j.comentario) setComentarios([...comentarios, j.comentario]);
      setTexto("");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onMudou}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl my-6 shadow-2xl text-slate-900 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 mb-1">
              {SETOR_NOME[t.sector]} · aberto por {primeiroNome(t.created_by_name, t.created_by_email)} há {tempoRelativo(t.created_at)}
            </div>
            <h2 className="text-xl font-bold">{t.title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={excluir}
              disabled={salvando}
              aria-label="Excluir ticket"
              title="Excluir ticket"
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
              </svg>
            </button>
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {erro && <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Status</span>
              <select className={INPUT} value={t.status} disabled={salvando} onChange={(e) => mudarStatus(e.target.value)}>
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Prioridade</span>
              {souAdminGeral ? (
                <select className={INPUT} value={t.priority} disabled={salvando} onChange={(e) => mudarPrioridade(e.target.value)}>
                  {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              ) : (
                <div className={`${INPUT} inline-flex items-center opacity-80`}>
                  {PRIORIDADE_NOME[t.priority] ?? t.priority}
                </div>
              )}
            </label>
            <button className={BTN} onClick={alternarResponsavel} disabled={salvando || !meuEmail}>
              {souResponsavel ? "Deixar de ser responsável" : "Assumir este ticket"}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Solicitante</h3>
              <div className={`${CARD} flex items-center gap-3 px-3 py-2.5`}>
                <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
                  {iniciais(t.created_by_name, t.created_by_email)}
                </span>
                <span className="text-sm">
                  <span className="block text-slate-900 dark:text-slate-100">{t.created_by_name ?? t.created_by_email}</span>
                  <span className="block text-xs text-slate-500">
                    {SETOR_NOME[t.sector] ?? t.sector} · há {tempoRelativo(t.created_at)}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Atuando na demanda</h3>
              <div className="space-y-2 mb-2">
                {responsaveis.map((r) => (
                  <div key={r.user_email} className={`${CARD} flex items-center justify-between px-3 py-2 text-sm`}>
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {iniciais(r.user_name, r.user_email)}
                      </span>
                      <span className="truncate">{r.user_name ?? r.user_email}</span>
                    </span>
                    <button
                      onClick={() => tirarPessoa(r.user_email)}
                      disabled={salvando}
                      title="Remover"
                      aria-label={`Remover ${r.user_name ?? r.user_email}`}
                      className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {responsaveis.length === 0 && <div className="text-sm text-slate-500 italic">Ninguém atribuído ainda.</div>}
              </div>
              <select
                className={`${INPUT} w-full`}
                value=""
                disabled={salvando}
                onChange={(e) => atribuirPessoa(e.target.value)}
              >
                <option value="">+ Atribuir alguém…</option>
                {(() => {
                  const { ti, ligacao } = pessoasAtribuiveis(
                    pessoas, t.sector, responsaveis.map((r) => r.user_email)
                  );
                  return (
                    <>
                      {ti.length > 0 && (
                        <optgroup label="Tecnologia">
                          {ti.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                        </optgroup>
                      )}
                      {ligacao.length > 0 && (
                        <optgroup label={SETOR_NOME[t.sector] ?? t.sector}>
                          {ligacao.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </div>
          </div>

          {souVejoMedicao && (
            <>
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Esforço do time de TI</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <CampoMedicao
                    rotulo="Horas estimadas" valor={t.horas_estimadas} sufixo="h"
                    ajuda="Quanto tempo prevemos gastar para atender a demanda"
                    editavel={souVejoMedicao} salvando={salvando}
                    onSalvar={(v) => salvarMedicao("horas_estimadas", v)} />
                  <CampoMedicao
                    rotulo="Horas realizadas" valor={t.horas_realizadas} sufixo="h"
                    ajuda="Quanto tempo gastamos de fato"
                    editavel={souVejoMedicao} salvando={salvando}
                    onSalvar={(v) => salvarMedicao("horas_realizadas", v)}
                    dica={desvio !== null
                      ? `${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}% em relação ao estimado`
                      : undefined} />
                </div>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Retorno para quem solicitou</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <CampoMedicao
                    rotulo="Ganho de tempo" valor={t.ganho_horas_mes} sufixo="h/mês"
                    ajuda="Tempo que a entrega devolve por mês na rotina do solicitante"
                    editavel={souVejoMedicao} salvando={salvando}
                    onSalvar={(v) => salvarMedicao("ganho_horas_mes", v)} />
                  <CampoMedicao
                    rotulo="Valor da hora" valor={t.valor_hora} prefixo="R$"
                    ajuda="Custo da hora da atividade que deixou de ser feita"
                    editavel={souVejoMedicao} salvando={salvando}
                    onSalvar={(v) => salvarMedicao("valor_hora", v)} />
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-900 rounded-lg px-3 py-2.5">
                    <div className="text-xs text-emerald-600 dark:text-emerald-500">Ganho mensal</div>
                    <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatReais(t.ganho_mensal)}</div>
                    <div className="text-[11px] text-emerald-600 mt-1">Ganho de tempo × valor da hora</div>
                    {retorno !== null && (
                      <div className="text-[11px] text-emerald-600">
                        O esforço se paga em {retorno.toFixed(1)} {retorno === 1 ? "mês" : "meses"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {t.description && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Descrição</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{t.description}</p>
            </div>
          )}

          {d.anexos.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Anexos ({d.anexos.length})</h3>
              <div className="flex flex-wrap gap-2">
                {d.anexos.map((a) => (
                  <a
                    key={a.id} href={a.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                  >
                    📎 {a.filename ?? "arquivo"}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Comentários ({comentarios.length})</h3>
            {comentarios.length === 0 && <p className="text-sm text-slate-500 italic mb-2">Nenhum comentário ainda.</p>}
            <div className="space-y-3 mb-3">
              {comentarios.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-semibold">
                    {iniciais(c.author_name, c.author_email)}
                  </span>
                  <div className={`${CARD} flex-1 px-3 py-2`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <strong className="text-sm text-slate-900 dark:text-slate-100">{c.author_name ?? c.author_email}</strong>
                      <span className="text-[11px] text-slate-500 shrink-0">{tempoRelativo(c.created_at)}</span>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                rows={3}
                placeholder="Escreva um comentário…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className={`${INPUT} w-full resize-y`}
              />
              <div className="flex justify-end">
                <button className={BTN_PRIMARY} onClick={comentar} disabled={salvando || !texto.trim()}>
                  {salvando ? "Enviando…" : "Comentar"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button className={BTN_PRIMARY} onClick={onMudou}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ campo de medição

function CampoMedicao({
  rotulo, valor, prefixo, sufixo, editavel, salvando, dica, ajuda, onSalvar,
}: {
  rotulo: string;
  valor: number | null;
  prefixo?: string;
  sufixo?: string;
  editavel: boolean;
  salvando: boolean;
  dica?: string;
  /** O que o campo significa — fica visível, não só no tooltip. */
  ajuda?: string;
  onSalvar: (v: string) => void;
}) {
  const [txt, setTxt] = useState(valor === null ? "" : String(valor));

  // Reflete mudanças vindas do servidor sem atropelar quem está digitando.
  useEffect(() => {
    setTxt(valor === null ? "" : String(valor));
  }, [valor]);

  const exibicao =
    valor === null ? "—" : `${prefixo ? prefixo + " " : ""}${valor.toLocaleString("pt-BR", {
      minimumFractionDigits: prefixo ? 2 : 0, maximumFractionDigits: 2,
    })}${sufixo ? " " + sufixo : ""}`;

  return (
    <div className={`${CARD} px-3 py-2.5`} title={ajuda}>
      <div className="text-xs text-slate-500">{rotulo}</div>
      {editavel ? (
        <input
          inputMode="decimal"
          value={txt}
          disabled={salvando}
          placeholder="—"
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => {
            const atual = valor === null ? "" : String(valor);
            if (txt.trim() !== atual) onSalvar(txt);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-full bg-transparent text-lg font-semibold outline-none border-b border-transparent focus:border-blue-500 py-0.5"
        />
      ) : (
        <div className="text-lg font-semibold">{exibicao}</div>
      )}
      {ajuda && <div className="text-[11px] text-slate-500 mt-1">{ajuda}</div>}
      {dica && <div className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">{dica}</div>}
    </div>
  );
}

// ------------------------------------------------------------ novo

function NovoTicket({
  setor, pessoas, onFechar, onCriado,
}: {
  setor: string;
  pessoas: PessoaTickets[];
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [atribuirA, setAtribuirA] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { ti, ligacao } = pessoasAtribuiveis(pessoas, setor);

  async function criar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, sector: setor, priority }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível criar."); return; }

      // Já atribui de cara, se a pessoa escolheu alguém — reaproveita o
      // mesmo PATCH usado no detalhe, que já dispara a notificação no Teams.
      if (atribuirA && j.id) {
        await fetch(`/api/tickets/${j.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atribuir: atribuirA }),
        }).catch(() => {});
      }

      onCriado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl text-slate-900 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold">Novo ticket em {SETOR_NOME[setor] ?? setor}</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {erro && <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Título</span>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Resuma o pedido em uma linha"
              className={`${INPUT} w-full`}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Descrição</span>
            <textarea
              rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="O que precisa ser feito, para quem e até quando"
              className={`${INPUT} w-full resize-y`}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Prioridade</span>
            <select className={`${INPUT} w-full`} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          {(ti.length > 0 || ligacao.length > 0) && (
            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Atribuir para (opcional)</span>
              <select className={`${INPUT} w-full`} value={atribuirA} onChange={(e) => setAtribuirA(e.target.value)}>
                <option value="">Não atribuir agora</option>
                {ti.length > 0 && (
                  <optgroup label="Tecnologia">
                    {ti.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                  </optgroup>
                )}
                {ligacao.length > 0 && (
                  <optgroup label={SETOR_NOME[setor] ?? setor}>
                    {ligacao.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          )}
          <p className="text-xs text-slate-500">O ticket entra no Backlog de {SETOR_NOME[setor] ?? setor}.</p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button className={BTN} onClick={onFechar}>Cancelar</button>
          <button className={BTN_PRIMARY} onClick={criar} disabled={salvando || !title.trim()}>
            {salvando ? "Criando…" : "Criar ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
