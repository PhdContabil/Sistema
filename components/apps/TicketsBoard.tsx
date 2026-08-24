"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SETORES, STATUS, PRIORIDADES, PRIORIDADE_NOME, SETOR_NOME,
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

export default function TicketsBoard({
  setor, tickets, resumo, incluirFinalizados, meuEmail, pessoas, souAdmin, erroServidor,
}: {
  setor: string;
  tickets: Ticket[];
  resumo: Record<string, number>;
  incluirFinalizados: boolean;
  meuEmail: string | null;
  pessoas: PessoaTickets[];
  souAdmin: boolean;
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

  const colunas = useMemo(() => {
    const visiveis = incluirFinalizados ? STATUS : STATUS.filter((s) => s.id !== "finalizado");
    return visiveis.map((s) => ({ ...s, itens: filtrados.filter((t) => t.status === s.id) }));
  }, [filtrados, incluirFinalizados]);

  async function abrir(id: string) {
    setCarregando(true);
    try {
      const r = await fetch(`/api/tickets/${id}`, { cache: "no-store" });
      if (r.ok) setAberto(await r.json());
    } finally {
      setCarregando(false);
    }
  }

  function trocarSetor(s: string) {
    const p = new URLSearchParams({ setor: s });
    if (incluirFinalizados) p.set("finalizados", "1");
    window.location.href = `/m/tecnologia/tickets?${p.toString()}`;
  }

  function alternarFinalizados() {
    const p = new URLSearchParams({ setor });
    if (!incluirFinalizados) p.set("finalizados", "1");
    window.location.href = `/m/tecnologia/tickets?${p.toString()}`;
  }

  const abertosNoSetor = tickets.filter((t) => t.status !== "finalizado").length;

  // Soma apenas do que está na tela, para acompanhar o filtro em vigor.
  const totalGanho = filtrados.reduce((s, t) => s + (t.ganho_mensal ?? 0), 0);
  const totalHorasMes = filtrados.reduce((s, t) => s + (t.ganho_horas_mes ?? 0), 0);
  const totalRealizadas = filtrados.reduce((s, t) => s + (t.horas_realizadas ?? 0), 0);

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}

      <div className="setor-tabs">
        {SETORES.map((s) => (
          <button
            key={s.id}
            className={`setor-tab ${s.id === setor ? "on" : ""}`}
            onClick={() => trocarSetor(s.id)}
          >
            {s.nome}
            {resumo[s.id] ? <span className="badge">{resumo[s.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar por título, descrição ou autor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="sel" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
          <option value="">Toda prioridade</option>
          {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <span className={`chip ${soMeus ? "on" : ""}`} onClick={() => setSoMeus((v) => !v)}>Meus</span>
        <span className={`chip ${incluirFinalizados ? "on" : ""}`} onClick={alternarFinalizados}>
          Ver finalizados
        </span>
        <button className="btn primary" onClick={() => setNovo(true)}>+ Novo ticket</button>
        <span className="contador">
          {filtrados.length} de {tickets.length} · {abertosNoSetor} em aberto
        </span>
      </div>

      {(totalGanho > 0 || totalRealizadas > 0) && (
        <div className="medicao" style={{ marginTop: 4 }}>
          <div className="med">
            <div className="k">Horas realizadas</div>
            <div className="v">{formatHoras(totalRealizadas)}</div>
          </div>
          <div className="med">
            <div className="k">Ganho de tempo</div>
            <div className="v">{formatHoras(totalHorasMes)}<span style={{ fontSize: 11, fontWeight: 400 }}> /mês</span></div>
          </div>
          <div className="med destaque">
            <div className="k">Ganho mensal</div>
            <div className="v">{formatReais(totalGanho)}</div>
            <div className="dica">{filtrados.length} tickets em tela</div>
          </div>
        </div>
      )}

      <div className="kanban">
        {colunas.map((c) => (
          <div key={c.id} className="col">
            <div className="col-head">
              <span className={`pt ${c.id}`} />
              {c.nome}
              <span className="qtd">{c.itens.length}</span>
            </div>
            <div className="col-body">
              {c.itens.map((t) => (
                <button key={t.id} className="tk" onClick={() => abrir(t.id)}>
                  <div className="tk-top">
                    <span className={`prio ${t.priority}`}>{PRIORIDADE_NOME[t.priority]}</span>
                    {t.ganho_mensal ? (
                      <span className="tk-ganho" title="Ganho mensal estimado">
                        {formatReais(t.ganho_mensal)}/mês
                      </span>
                    ) : null}
                    <span className="tk-idade">{tempoRelativo(t.created_at)}</span>
                  </div>
                  <div className="tk-titulo">{t.title}</div>
                  {t.description && <div className="tk-desc">{t.description}</div>}
                  <div className="tk-pe">
                    <span className="tk-autor">{primeiroNome(t.created_by_name, t.created_by_email)}</span>
                    <span className="tk-icones">
                      {t.qtdComentarios > 0 && <span title="comentários">💬 {t.qtdComentarios}</span>}
                      {t.qtdAnexos > 0 && <span title="anexos">📎 {t.qtdAnexos}</span>}
                    </span>
                    <span className="avatares">
                      {t.responsaveis.map((r) => (
                        <span key={r.user_email} className="av" title={r.user_name ?? r.user_email}>
                          {iniciais(r.user_name, r.user_email)}
                        </span>
                      ))}
                    </span>
                  </div>
                </button>
              ))}
              {c.itens.length === 0 && <div className="col-vazia">Nada aqui</div>}
            </div>
          </div>
        ))}
      </div>

      {carregando && <div className="toast">Abrindo…</div>}

      {aberto && (
        <DetalheTicket
          d={aberto}
          meuEmail={meuEmail}
          pessoas={pessoas}
          souAdmin={souAdmin}
          onFechar={() => setAberto(null)}
          onMudou={() => { setAberto(null); router.refresh(); }}
        />
      )}

      {novo && (
        <NovoTicket
          setor={setor}
          onFechar={() => setNovo(false)}
          onCriado={() => { setNovo(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------ detalhe

function DetalheTicket({
  d, meuEmail, pessoas, souAdmin, onFechar, onMudou,
}: {
  d: Detalhe;
  meuEmail: string | null;
  pessoas: PessoaTickets[];
  souAdmin: boolean;
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
    <div className="modal-bg" onClick={onMudou}>
      <div className="modal larga" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="tk-crumbs">
              {SETOR_NOME[t.sector]} · aberto por {primeiroNome(t.created_by_name, t.created_by_email)} há {tempoRelativo(t.created_at)}
            </div>
            <h2>{t.title}</h2>
          </div>
          <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          {erro && <div className="banner error">{erro}</div>}

          <div className="tk-controles">
            <label>
              <span>Status</span>
              <select className="sel" value={t.status} disabled={salvando}
                      onChange={(e) => mudarStatus(e.target.value)}>
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
            <label>
              <span>Prioridade</span>
              <select className="sel" value={t.priority} disabled={salvando}
                      onChange={(e) => mudarPrioridade(e.target.value)}>
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <button className="btn" onClick={alternarResponsavel} disabled={salvando || !meuEmail}>
              {souResponsavel ? "Deixar de ser responsável" : "Assumir este ticket"}
            </button>
          </div>

          <h3>Quem está atuando</h3>
          <div className="atuando">
            {responsaveis.map((r) => (
              <span key={r.user_email} className="pessoa-chip">
                <span className="av">{iniciais(r.user_name, r.user_email)}</span>
                {r.user_name ?? r.user_email}
                <button onClick={() => tirarPessoa(r.user_email)} disabled={salvando}
                        title="Remover" aria-label={`Remover ${r.user_name ?? r.user_email}`}>✕</button>
              </span>
            ))}
            {responsaveis.length === 0 && <span className="nota">Ninguém atuando ainda.</span>}
          </div>
          <select
            className="sel"
            value=""
            disabled={salvando}
            onChange={(e) => atribuirPessoa(e.target.value)}
            style={{ maxWidth: 280, marginTop: 8 }}
          >
            <option value="">+ Adicionar pessoa…</option>
            {pessoas
              .filter((p) => !responsaveis.some((r) => r.user_email.toLowerCase() === p.email.toLowerCase()))
              .map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name} · {SETOR_NOME[p.sector] ?? p.sector}
                </option>
              ))}
          </select>

          <h3>Esforço e retorno</h3>
          <div className="medicao">
            <CampoMedicao rotulo="Horas estimadas" valor={t.horas_estimadas} sufixo="h"
                          editavel={souAdmin} salvando={salvando}
                          onSalvar={(v) => salvarMedicao("horas_estimadas", v)} />
            <CampoMedicao rotulo="Horas realizadas" valor={t.horas_realizadas} sufixo="h"
                          editavel={souAdmin} salvando={salvando}
                          onSalvar={(v) => salvarMedicao("horas_realizadas", v)}
                          dica={desvio !== null
                            ? `${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}% vs. estimado`
                            : undefined} />
            <CampoMedicao rotulo="Ganho de tempo" valor={t.ganho_horas_mes} sufixo="h/mês"
                          editavel={souAdmin} salvando={salvando}
                          onSalvar={(v) => salvarMedicao("ganho_horas_mes", v)} />
            <CampoMedicao rotulo="Valor da hora" valor={t.valor_hora} prefixo="R$"
                          editavel={souAdmin} salvando={salvando}
                          onSalvar={(v) => salvarMedicao("valor_hora", v)} />
            <div className="med destaque">
              <div className="k">Ganho mensal</div>
              <div className="v">{formatReais(t.ganho_mensal)}</div>
              <div className="dica">
                {retorno !== null
                  ? `se paga em ${retorno.toFixed(1)} ${retorno === 1 ? "mês" : "meses"}`
                  : "ganho de tempo x valor da hora"}
              </div>
            </div>
          </div>
          {!souAdmin && (
            <p className="nota">
              Só administradores e sub-administradores editam horas e valores.
            </p>
          )}

          {t.description && (
            <>
              <h3>Descrição</h3>
              <p className="tk-descricao">{t.description}</p>
            </>
          )}

          {d.anexos.length > 0 && (
            <>
              <h3>Anexos ({d.anexos.length})</h3>
              <div className="anexos">
                {d.anexos.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="anexo">
                    📎 {a.filename ?? "arquivo"}
                  </a>
                ))}
              </div>
            </>
          )}

          <h3>Comentários ({comentarios.length})</h3>
          {comentarios.length === 0 && <p className="nota">Nenhum comentário ainda.</p>}
          <div className="comentarios">
            {comentarios.map((c) => (
              <div key={c.id} className="cmt">
                <span className="av">{iniciais(c.author_name, c.author_email)}</span>
                <div>
                  <div className="cmt-head">
                    <strong>{c.author_name ?? c.author_email}</strong>
                    <span>{tempoRelativo(c.created_at)}</span>
                  </div>
                  <div className="cmt-body">{c.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="cmt-novo">
            <textarea
              rows={3}
              placeholder="Escreva um comentário…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button className="btn primary" onClick={comentar} disabled={salvando || !texto.trim()}>
              {salvando ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={onMudou}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ campo de medição

function CampoMedicao({
  rotulo, valor, prefixo, sufixo, editavel, salvando, dica, onSalvar,
}: {
  rotulo: string;
  valor: number | null;
  prefixo?: string;
  sufixo?: string;
  editavel: boolean;
  salvando: boolean;
  dica?: string;
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
    <div className="med">
      <div className="k">{rotulo}</div>
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
        />
      ) : (
        <div className="v">{exibicao}</div>
      )}
      {dica && <div className="dica">{dica}</div>}
    </div>
  );
}

// ------------------------------------------------------------ novo

function NovoTicket({
  setor, onFechar, onCriado,
}: {
  setor: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState(setor);
  const [priority, setPriority] = useState("media");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, sector, priority }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível criar."); return; }
      onCriado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Novo ticket</h2>
          <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">
          {erro && <div className="banner error">{erro}</div>}
          <div className="form">
            <label>
              <span>Título</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                     placeholder="Resuma o pedido em uma linha" />
            </label>
            <label>
              <span>Descrição</span>
              <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="O que precisa ser feito, para quem e até quando" />
            </label>
            <div className="form-linha">
              <label>
                <span>Setor</span>
                <select className="sel" value={sector} onChange={(e) => setSector(e.target.value)}>
                  {SETORES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <label>
                <span>Prioridade</span>
                <select className="sel" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
            </div>
          </div>
          <p className="nota">O ticket entra no Backlog do setor escolhido.</p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onFechar}>Cancelar</button>{" "}
          <button className="btn primary" onClick={criar} disabled={salvando || !title.trim()}>
            {salvando ? "Criando…" : "Criar ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
