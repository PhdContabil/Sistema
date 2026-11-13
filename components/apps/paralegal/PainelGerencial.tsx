"use client";
// Painel Gerencial do Paralegal — só desenha o que a página calculou no servidor.
// Ações: filtrar, paginar, baixar planilha/PDF, enviar por e-mail e pedir retorno ao responsável.
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  dataBR, filtrarProcessos, processosParaCsv, ROTULO_ALERTA,
  type Alerta, type Filtros, type LinhaResponsavel, type ProcessoPainel, type Resumo,
} from "@/lib/paralegal/painel";

const POR_PAGINA = 25;
const ALERTAS: Alerta[] = ["atrasado", "vence_2d", "vence_7d", "em_dia", "sem_pendencia", "backlog", "sem_checklist"];
const COBRAVEL = ["atrasado", "vence_2d", "vence_7d"];

function quando(dias: number | null): string {
  if (dias === null) return "sem prazo";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias > 0) return `em ${dias} dias`;
  return `${-dias} dia${dias === -1 ? "" : "s"} de atraso`;
}

type Envio =
  | { tipo: "relatorio" }
  | { tipo: "cobrar"; responsavel: string; processoId?: number; nome?: string };

export default function PainelGerencial({ hoje, processos, resumo, responsaveis, status, emails, meuEmail }: {
  hoje: string; processos: ProcessoPainel[]; resumo: Resumo; responsaveis: LinhaResponsavel[];
  status: { status: string; total: number }[]; emails: Record<string, string>; meuEmail: string;
}) {
  const [alerta, setAlerta] = useState<Alerta | "todos">("todos");
  const [resp, setResp] = useState("");
  const [st, setSt] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [envio, setEnvio] = useState<Envio | null>(null);

  const filtros: Filtros = { alerta, responsavel: resp, status: st, busca };
  const lista = useMemo(() => filtrarProcessos(processos, filtros), [processos, alerta, resp, st, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas);
  const visiveis = lista.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  useEffect(() => { setPagina(1); setAberto(null); }, [alerta, resp, st, busca]);

  async function baixarPdf() {
    const { gerarPdfPainel } = await import("./painel-pdf");
    const partes = [alerta !== "todos" ? ROTULO_ALERTA[alerta] : "", resp, st, busca ? `"${busca}"` : ""].filter(Boolean);
    gerarPdfPainel(lista, resumo, hoje, partes.join(" | "));
  }

  function baixar() {
    const blob = new Blob([processosParaCsv(lista)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `painel-gerencial-paralegal-${hoje}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const cards: { k: Alerta | "todos"; rot: string; v: number }[] = [
    { k: "todos", rot: "Processos ativos", v: resumo.ativos },
    { k: "atrasado", rot: "Atrasados", v: resumo.atrasados },
    { k: "vence_2d", rot: "Vencem em 2 dias", v: resumo.vence2d },
    { k: "vence_7d", rot: "Vencem em 7 dias", v: resumo.vence7d },
    { k: "sem_pendencia", rot: "Prontos para concluir", v: resumo.prontos },
  ];
  const filtrando = alerta !== "todos" || resp || st || busca;

  return (
    <div className="pg">
      <div className="pg-topo">
        <div className="pg-nota">Atualizado em {dataBR(hoje)}. Atrasos de mais de 30 dias ficam como “atraso antigo” e não entram nos alertas. {resumo.faltam} atividades ainda faltam no total.</div>
        <div className="pg-acoes">
          <button className="btn" onClick={baixar} disabled={lista.length === 0}>Baixar planilha</button>
          <button className="btn" onClick={baixarPdf} disabled={lista.length === 0}>Baixar PDF</button>
          <button className="btn primary" onClick={() => setEnvio({ tipo: "relatorio" })} disabled={lista.length === 0}>Enviar por e-mail</button>
        </div>
      </div>

      <div className="pg-cards">
        {cards.map((c) => (
          <button key={c.k} className={`pg-card ${c.k} ${alerta === c.k ? "on" : ""}`} onClick={() => setAlerta(alerta === c.k ? "todos" : c.k)}>
            <span className="pg-k">{c.rot}</span><span className="pg-v">{c.v}</span>
          </button>
        ))}
      </div>

      <div className="pg-bloco">
        <h2>Por responsável</h2>
        <div className="pg-tabela-wrap">
          <table className="pg-tabela">
            <thead><tr><th>Responsável</th><th>Processos</th><th>Atividades que faltam</th><th>Atrasados</th><th>Vencem 2d</th><th>Vencem 7d</th><th></th></tr></thead>
            <tbody>
              {responsaveis.map((r) => (
                <tr key={r.responsavel} className="clicavel" onClick={() => setResp(resp === r.responsavel ? "" : r.responsavel)}>
                  <td><b>{r.responsavel}</b>{resp === r.responsavel && <span className="pg-peq"> (filtrando)</span>}</td>
                  <td>{r.processos}</td><td>{r.faltam}</td>
                  <td className={r.atrasado ? "pg-ruim" : ""}>{r.atrasado}</td><td>{r.vence2d}</td><td>{r.vence7d}</td>
                  <td>
                    {r.atrasado + r.vence2d + r.vence7d > 0 && (
                      <button className="btn pg-mini" onClick={(e) => { e.stopPropagation(); setEnvio({ tipo: "cobrar", responsavel: r.responsavel }); }}>Pedir retorno</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pg-bloco">
        <h2>Processos <span className="pg-cont">{lista.length}</span></h2>
        <div className="pg-filtros">
          <input placeholder="Buscar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => <option key={r.responsavel}>{r.responsavel}</option>)}
          </select>
          <select value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">Todos os status</option>
            {status.map((s) => <option key={s.status} value={s.status}>{s.status} ({s.total})</option>)}
          </select>
          <select value={alerta} onChange={(e) => setAlerta(e.target.value as Alerta | "todos")}>
            <option value="todos">Todos os alertas</option>
            {ALERTAS.map((a) => <option key={a} value={a}>{ROTULO_ALERTA[a]}</option>)}
          </select>
          {filtrando && <button className="btn" onClick={() => { setAlerta("todos"); setResp(""); setSt(""); setBusca(""); }}>Limpar filtros</button>}
        </div>
        <div className="pg-tabela-wrap">
          <table className="pg-tabela">
            <thead><tr><th>Empresa</th><th>Responsável</th><th>Status</th><th>Onde está</th><th>Andamento</th><th>Alerta</th></tr></thead>
            <tbody>
              {visiveis.map((p) => (
                <Fragment key={p.id}>
                  <tr className="clicavel" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                    <td><b>{p.nome}</b></td>
                    <td>{p.responsavel}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.etapaManual && <div className="pg-manual">{p.etapaManual}</div>}
                      <div>{p.etapaAtual}</div>
                      {p.etapaPrazo && <div className="pg-peq">prazo {dataBR(p.etapaPrazo)}</div>}
                    </td>
                    <td>
                      <div className="pg-barra"><i style={{ width: `${p.feitas + p.falta ? Math.round((100 * p.feitas) / (p.feitas + p.falta)) : 0}%` }} /></div>
                      <div className="pg-peq">{p.feitas} feitas · {p.falta} faltam</div>
                    </td>
                    <td>
                      <span className={`pg-tag ${p.alerta}`}>{ROTULO_ALERTA[p.alerta]}</span>
                      {COBRAVEL.includes(p.alerta) && (
                        <button className="btn pg-mini" onClick={(e) => { e.stopPropagation(); setEnvio({ tipo: "cobrar", responsavel: p.responsavel, processoId: p.id, nome: p.nome }); }}>Pedir retorno</button>
                      )}
                    </td>
                  </tr>
                  {aberto === p.id && (
                    <tr className="pg-det"><td colSpan={6}>
                      {p.abertas.length === 0 ? <i>Nenhuma atividade em aberto.</i> : (
                        <table className="pg-tabela interna">
                          <thead><tr><th>Etapa</th><th>Atividade</th><th>Responsável</th><th>Situação</th><th>Prazo</th></tr></thead>
                          <tbody>{p.abertas.map((a) => (
                            <tr key={a.id}><td>{a.ordem}</td><td>{a.nome}</td><td>{a.responsavel}</td><td>{a.situacao}</td>
                              <td className={a.categoria === "atrasada" ? "pg-ruim" : ""}>{dataBR(a.prazo) || "—"} <span className="pg-peq">({quando(a.dias)})</span></td></tr>
                          ))}</tbody>
                        </table>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {lista.length === 0 && <tr><td colSpan={6} className="pg-vazio">Nenhum processo nesse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {lista.length > POR_PAGINA && (
          <div className="pg-pag">
            <button className="btn" disabled={atual === 1} onClick={() => setPagina(1)}>«</button>
            <button className="btn" disabled={atual === 1} onClick={() => setPagina(atual - 1)}>Anterior</button>
            <span>Página {atual} de {paginas} · {(atual - 1) * POR_PAGINA + 1}–{Math.min(atual * POR_PAGINA, lista.length)} de {lista.length}</span>
            <button className="btn" disabled={atual === paginas} onClick={() => setPagina(atual + 1)}>Próxima</button>
            <button className="btn" disabled={atual === paginas} onClick={() => setPagina(paginas)}>»</button>
          </div>
        )}
      </div>

      {envio && <EnvioEmail envio={envio} filtros={filtros} total={lista.length} emails={emails} meuEmail={meuEmail} onFechar={() => setEnvio(null)} />}
    </div>
  );
}

function EnvioEmail({ envio, filtros, total, emails, meuEmail, onFechar }: {
  envio: Envio; filtros: Filtros; total: number; emails: Record<string, string>; meuEmail: string; onFechar: () => void;
}) {
  const cobrar = envio.tipo === "cobrar";
  const [para, setPara] = useState(cobrar ? emails[envio.responsavel] || "" : meuEmail);
  const [recado, setRecado] = useState("");
  const [estado, setEstado] = useState<"" | "enviando" | "ok" | "erro">("");
  const [msg, setMsg] = useState("");

  async function enviar() {
    setEstado("enviando"); setMsg("");
    try {
      const r = await fetch("/api/paralegal/painel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: cobrar ? "cobrar" : "relatorio",
          para: para.split(/[;, \n]+/).filter(Boolean),
          ...(cobrar ? { responsavel: envio.responsavel, processoId: envio.processoId, recado } : { filtros }),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível enviar.");
      setEstado("ok");
      setMsg(cobrar ? `Pedido de retorno enviado (${j.processos} processo${j.processos === 1 ? "" : "s"}).` : `Relatório enviado com ${j.processos} processos.`);
    } catch (e) { setEstado("erro"); setMsg(e instanceof Error ? e.message : "Erro ao enviar."); }
  }

  return (
    <div className="pg-fundo" onClick={onFechar}>
      <div className="pg-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{cobrar ? `Pedir retorno a ${envio.responsavel}` : "Enviar relatório por e-mail"}</h3>
        <p className="pg-peq">
          {cobrar
            ? envio.processoId ? `Vai listar as pendências de ${envio.nome}.` : "Vai listar os processos atrasados ou que vencem em até 7 dias."
            : `Vai enviar os ${total} processos do filtro atual, com o resumo no topo.`}
        </p>
        <label>Para (e-mails @phdcontabil.com.br, separe por vírgula)
          <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="nome@phdcontabil.com.br" />
        </label>
        {cobrar && !emails[envio.responsavel] && <p className="pg-peq pg-ruim">Não achei o e-mail de {envio.responsavel} no cadastro de pessoas. Digite acima.</p>}
        {cobrar && (
          <label>Recado (opcional)
            <textarea rows={3} value={recado} onChange={(e) => setRecado(e.target.value)} placeholder="Deixe vazio para usar o texto padrão." />
          </label>
        )}
        {msg && <p className={estado === "ok" ? "pg-ok" : "pg-ruim"}>{msg}</p>}
        <div className="pg-modal-acoes">
          <button className="btn" onClick={onFechar}>{estado === "ok" ? "Fechar" : "Cancelar"}</button>
          {estado !== "ok" && <button className="btn primary" onClick={enviar} disabled={estado === "enviando" || !para.trim()}>{estado === "enviando" ? "Enviando…" : "Enviar"}</button>}
        </div>
      </div>
    </div>
  );
}
