"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS, PRIORIDADES, PRIORIDADE_NOME, SETOR_NOME,
  iniciais, primeiroNome, tempoRelativo, formatarDataHora,
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

  // Cópia local dos tickets — permite mover de coluna (arrastar) e excluir/
  // finalizar direto do card sem esperar o servidor responder de novo.
  // Sincroniza quando os dados vêm de novo do servidor (ex.: router.refresh()).
  const [ticketsState, setTicketsState] = useState(tickets);
  useEffect(() => setTicketsState(tickets), [tickets]);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ticketsState.filter((t) => {
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
  }, [ticketsState, busca, prioridade, soMeus, meuEmail]);

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

  /** Move um ticket pra outra coluna (arrastar, ou o botão "Finalizar" rápido). */
  async function moverStatus(id: string, status: string) {
    const atual = ticketsState.find((t) => t.id === id);
    if (!atual || atual.status === status) return;
    const statusAnterior = atual.status;
    setTicketsState((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const r = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      // Servidor recusou — volta o card pra coluna de origem.
      setTicketsState((prev) => prev.map((t) => (t.id === id ? { ...t, status: statusAnterior } : t)));
    }
  }

  /** Exclui direto do card do quadro, sem precisar abrir o ticket. */
  async function excluirRapido(id: string, titulo: string) {
    if (!confirm(`Excluir o ticket "${titulo}"? Essa ação não pode ser desfeita.`)) return;
    const antes = ticketsState;
    setTicketsState((prev) => prev.filter((t) => t.id !== id));
    try {
      const r = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      setTicketsState(antes);
      alert("Não foi possível excluir o ticket.");
    }
  }

  function soltarNaColuna(e: DragEvent<HTMLDivElement>, statusColuna: string) {
    e.preventDefault();
    setColunaSobre(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) moverStatus(id, statusColuna);
  }

  const abertosNoSetor = ticketsState.filter((t) => t.status !== "finalizado").length;

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
          {filtrados.length} de {ticketsState.length} · {abertosNoSetor} em aberto
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
            onDragOver={(e) => { e.preventDefault(); if (colunaSobre !== c.id) setColunaSobre(c.id); }}
            onDragLeave={() => setColunaSobre((v) => (v === c.id ? null : v))}
            onDrop={(e) => soltarNaColuna(e, c.id)}
            className={`w-72 shrink-0 rounded-xl border flex flex-col max-h-[72vh] transition-colors ${
              colunaSobre === c.id
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800"
                : "bg-slate-100/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COR[c.id] ?? "bg-slate-500"}`} />
              <h3 className="font-semibold text-sm flex-1">{c.nome}</h3>
              <span className="text-xs text-slate-500">{c.itens.length}</span>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto flex-1">
              {c.itens.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    setArrastando(t.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.id);
                  }}
                  onDragEnd={() => setArrastando(null)}
                  onClick={() => abrir(t.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") abrir(t.id); }}
                  className={`w-full text-left bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 transition shadow-sm dark:shadow-none cursor-grab active:cursor-grabbing ${
                    arrastando === t.id ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] text-white ${PRIORIDADE_COR[t.priority] ?? "bg-slate-500"}`}>
                      {PRIORIDADE_NOME[t.priority]}
                    </span>
                    {t.incidente && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold
                                       bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            title="Classificado como incidente pelo TI">
                        Incidente
                      </span>
                    )}
                    {souVejoMedicao && t.ganho_mensal ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400" title="Ganho mensal estimado">
                        {formatReais(t.ganho_mensal)}/mês
                      </span>
                    ) : null}
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">{tempoRelativo(t.created_at)}</span>
                    {t.status !== "finalizado" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moverStatus(t.id, "finalizado"); }}
                        title="Finalizar ticket"
                        aria-label="Finalizar ticket"
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/30 shrink-0"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); excluirRapido(t.id, t.title); }}
                      title="Excluir ticket"
                      aria-label="Excluir ticket"
                      className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 shrink-0"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-sm font-medium leading-snug mb-1">
                    {t.numero != null && (
                      <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 mr-1.5">#{t.numero}</span>
                    )}
                    {t.title}
                  </div>
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
                </div>
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
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [tituloEdicao, setTituloEdicao] = useState(d.ticket.title);
  const [editandoDescricao, setEditandoDescricao] = useState(false);
  const [descricaoEdicao, setDescricaoEdicao] = useState(d.ticket.description ?? "");

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
  /**
   * Classifica o chamado como incidente. Quem decide é o TI — o servidor
   * recusa de qualquer outra pessoa, então o botão escondido não é a trava.
   */
  async function marcarIncidente(v: boolean) {
    if (await patch({ incidente: v })) onMudou();
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

  function comecarEdicaoTitulo() {
    setTituloEdicao(t.title);
    setEditandoTitulo(true);
  }
  async function salvarTitulo() {
    const novo = tituloEdicao.trim();
    if (!novo) return;
    if (await patch({ title: novo })) {
      setT({ ...t, title: novo });
      setEditandoTitulo(false);
    }
  }

  function comecarEdicaoDescricao() {
    setDescricaoEdicao(t.description ?? "");
    setEditandoDescricao(true);
  }
  async function salvarDescricao() {
    const nova = descricaoEdicao.trim();
    if (await patch({ description: nova })) {
      setT({ ...t, description: nova });
      setEditandoDescricao(false);
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

  /**
   * Sobe uma imagem (colada, arrastada ou escolhida no botão de anexar) e
   * cola o link markdown ![imagem](url) no texto — igual ao sistema antigo de
   * tickets, só que agora salva no Storage do próprio Núcleo.
   */
  async function enviarImagem(file: File) {
    if (!file.type.startsWith("image/")) return;
    setEnviandoImagem(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/tickets/${t.id}/anexos`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível enviar a imagem."); return; }
      const url = j.anexo?.url as string | undefined;
      if (url) setTexto((cur) => (cur ? `${cur}\n\n![imagem](${url})\n` : `![imagem](${url})`));
    } finally {
      setEnviandoImagem(false);
    }
  }

  function aoColar(e: ClipboardEvent<HTMLTextAreaElement>) {
    const itens = e.clipboardData?.items;
    if (!itens) return;
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const arquivo = item.getAsFile();
        if (arquivo) { e.preventDefault(); enviarImagem(arquivo); }
      }
    }
  }

  function aoSoltarArquivo(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith("image/")) enviarImagem(f);
    }
  }

  function comecarEdicao(c: Comentario) {
    setEditandoId(c.id);
    setTextoEdicao(c.body);
  }

  async function salvarEdicao(id: string) {
    const novoTexto = textoEdicao.trim();
    if (!novoTexto) return;
    setSalvandoEdicao(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/${t.id}/comentarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: novoTexto }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível editar o comentário."); return; }
      setComentarios((cs) => cs.map((c) => (c.id === id ? { ...c, body: novoTexto } : c)));
      setEditandoId(null);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirComentario(id: string) {
    if (!confirm("Excluir esse comentário? Essa ação não pode ser desfeita.")) return;
    setErro(null);
    const r = await fetch(`/api/tickets/${t.id}/comentarios/${id}`, { method: "DELETE" }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (!r || !r.ok) { setErro(j.error ?? "Não foi possível excluir o comentário."); return; }
    setComentarios((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onMudou}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl my-6 shadow-2xl text-slate-900 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 mb-1">
              {t.numero != null && <span className="font-mono">#{t.numero}</span>}
              {t.numero != null && " · "}
              {SETOR_NOME[t.sector]} · aberto por {primeiroNome(t.created_by_name, t.created_by_email)} há {tempoRelativo(t.created_at)}
            </div>
            {editandoTitulo ? (
              <div className="flex items-center gap-2">
                <input
                  className={`${INPUT} text-xl font-bold flex-1`}
                  value={tituloEdicao}
                  onChange={(e) => setTituloEdicao(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarTitulo();
                    if (e.key === "Escape") setEditandoTitulo(false);
                  }}
                  autoFocus
                />
                <button className={BTN} onClick={() => setEditandoTitulo(false)} disabled={salvando}>
                  Cancelar
                </button>
                <button className={BTN_PRIMARY} onClick={salvarTitulo} disabled={salvando || !tituloEdicao.trim()}>
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            ) : (
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="truncate">{t.title}</span>
                <button
                  onClick={comecarEdicaoTitulo}
                  title="Editar título"
                  aria-label="Editar título"
                  className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </button>
              </h2>
            )}
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
            {souVejoMedicao ? (
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                t.incidente
                  ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                  : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              }`} title="Incidente consome a reserva de incidentes da sprint, não o tempo planejado">
                <input type="checkbox" checked={!!t.incidente} disabled={salvando}
                       onChange={(e) => marcarIncidente(e.target.checked)} />
                É incidente
              </label>
            ) : t.incidente ? (
              <span className="px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700
                               text-amber-700 dark:text-amber-400 text-sm">
                Incidente
              </span>
            ) : null}
            {t.status === "finalizado" && t.closed_at && (
              <span className="text-xs text-slate-500 ml-auto pb-2.5">
                Encerrado em {formatarDataHora(t.closed_at)}
              </span>
            )}
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-widest text-slate-500">Descrição</h3>
              {!editandoDescricao && (
                <button
                  onClick={comecarEdicaoDescricao}
                  title="Editar descrição"
                  aria-label="Editar descrição"
                  className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </button>
              )}
            </div>
            {editandoDescricao ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={descricaoEdicao}
                  onChange={(e) => setDescricaoEdicao(e.target.value)}
                  className={`${INPUT} w-full resize-y`}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button className={BTN} onClick={() => setEditandoDescricao(false)} disabled={salvando}>
                    Cancelar
                  </button>
                  <button className={BTN_PRIMARY} onClick={salvarDescricao} disabled={salvando}>
                    {salvando ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            ) : t.description ? (
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{t.description}</p>
            ) : (
              <p className="text-sm text-slate-500 italic">Sem descrição.</p>
            )}
          </div>

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
              {comentarios.map((c) => {
                const souAutor = !!meuEmail && c.author_email.toLowerCase() === meuEmail;
                const possoExcluir = souAutor || souAdmin;
                const editando = editandoId === c.id;
                return (
                  <div key={c.id} className="flex gap-3">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-semibold">
                      {iniciais(c.author_name, c.author_email)}
                    </span>
                    <div className={`${CARD} flex-1 px-3 py-2`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <strong className="text-sm text-slate-900 dark:text-slate-100">{c.author_name ?? c.author_email}</strong>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] text-slate-500">{tempoRelativo(c.created_at)}</span>
                          {!editando && souAutor && (
                            <button
                              onClick={() => comecarEdicao(c)}
                              title="Editar comentário"
                              aria-label="Editar comentário"
                              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                              </svg>
                            </button>
                          )}
                          {!editando && possoExcluir && (
                            <button
                              onClick={() => excluirComentario(c.id)}
                              title="Excluir comentário"
                              aria-label="Excluir comentário"
                              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </div>
                      {editando ? (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            value={textoEdicao}
                            onChange={(e) => setTextoEdicao(e.target.value)}
                            className={`${INPUT} w-full resize-y`}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button className={BTN} onClick={() => setEditandoId(null)} disabled={salvandoEdicao}>
                              Cancelar
                            </button>
                            <button
                              className={BTN_PRIMARY}
                              onClick={() => salvarEdicao(c.id)}
                              disabled={salvandoEdicao || !textoEdicao.trim()}
                            >
                              {salvandoEdicao ? "Salvando…" : "Salvar"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ComentarioTexto texto={c.body} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviarImagem(f);
                  e.target.value = "";
                }}
              />
              <textarea
                rows={3}
                placeholder="Escreva um comentário… (dá pra colar ou arrastar uma imagem aqui)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onPaste={aoColar}
                onDrop={aoSoltarArquivo}
                onDragOver={(e) => e.preventDefault()}
                className={`${INPUT} w-full resize-y`}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => arquivoRef.current?.click()}
                    disabled={enviandoImagem}
                    title="Anexar imagem"
                  >
                    📎 {enviandoImagem ? "Enviando imagem…" : "Anexar imagem"}
                  </button>
                  <span className="text-xs text-slate-500 hidden sm:inline">ou cole com Ctrl+V</span>
                </div>
                <button className={BTN_PRIMARY} onClick={comentar} disabled={salvando || enviandoImagem || !texto.trim()}>
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

// ------------------------------------------------------------ comentário (texto + imagens coladas)

/**
 * Um comentário pode ter imagens coladas/anexadas no meio do texto, no mesmo
 * formato markdown do sistema antigo de tickets: ![legenda](url). Aqui a
 * gente separa o texto normal das imagens e mostra cada imagem como preview
 * clicável, em vez do link cru.
 */
function ComentarioTexto({ texto }: { texto: string }) {
  const partes: (string | { alt: string; url: string })[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let ultimoIndice = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texto)) !== null) {
    if (m.index > ultimoIndice) partes.push(texto.slice(ultimoIndice, m.index));
    partes.push({ alt: m[1] || "imagem", url: m[2] });
    ultimoIndice = m.index + m[0].length;
  }
  if (ultimoIndice < texto.length) partes.push(texto.slice(ultimoIndice));

  return (
    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line break-words">
      {partes.map((parte, i) =>
        typeof parte === "string" ? (
          parte && <span key={i}>{parte}</span>
        ) : (
          <a key={i} href={parte.url} target="_blank" rel="noreferrer" className="block my-2 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={parte.url}
              alt={parte.alt}
              className="max-w-full sm:max-w-sm max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600"
            />
          </a>
        )
      )}
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
