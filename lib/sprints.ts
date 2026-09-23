// Sprint do TI — acesso a dados (SERVIDOR).
//
// Apontamento de horas é MANUAL, uma vez por dia. Existiu um cronômetro
// iniciar/pausar aqui; foi removido porque o time decidiu apontar no fim do
// expediente. A tabela `ticket_execucoes` continua guardando cada lançamento
// (data, horas, autor, comentário) — o que mudou foi só de onde o número vem.
//
// Desenho central: o cartão continua sendo o mesmo ticket, no mesmo board do
// setor que o pediu. A sprint não copia nada — só registra que aquele cartão
// foi puxado para o ciclo atual, por quem e com quantas horas. Assim o board de
// cada equipe segue sendo o backlog, e quem abriu o chamado vê o status mudar
// sem precisar entrar em outra tela.

import { ticketsDb, type Ticket } from "./tickets";
import { diasUteis, datasUteis, horaValida, PASSO_HORAS, type Folga } from "./sprints-calculo";

export * from "./sprints-calculo";

export type EstadoSprint = "planejada" | "ativa" | "encerrada";

export interface Sprint {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  estado: EstadoSprint;
  objetivo: string | null;
  criada_por: string | null;
  criada_em: string;
}

export interface ItemSprint {
  sprint_id: string;
  ticket_id: string;
  responsavel_email: string | null;
  horas_planejadas: number | null;
  ordem: number;
  ticket: Ticket | null;
  /** Segundos já lançados neste cartão, somando todo mundo. */
  segundosExecutados: number;
  /** O mesmo em horas decimais — é com isso que o restante é calculado. */
  horasApontadas: number;
  apontamentos: Apontamento[];
}

export interface CapacidadeLinha {
  sprint_id: string;
  email: string;
  horas_dia: number;
  /** Horas separadas para incidentes nesta sprint. */
  horas_incidente: number;
}

/** Folga gravada: feriado do time (email nulo) ou ausência de uma pessoa. */
export interface FolgaSprint extends Folga {
  id: string;
  sprint_id: string;
  email: string | null;
  motivo: string | null;
}

/** Lançamento de horas no cartão — do cronômetro ou digitado à mão. */
export interface Apontamento {
  id: string;
  ticket_id: string;
  email: string;
  data: string;
  segundos: number;
  horas: number;
  comentario: string | null;
  inicio: string;
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Quem pode mexer no Estimate de um cartão — de qualquer cartão.
 *
 * O Estimate é o que o time se compromete a entregar na sprint e o teto de
 * horas do cartão; deixar cada um ajustar o próprio faria a conta de capacity
 * virar autodeclaração. Fica com uma pessoa só, por decisão do Gabriel
 * (23/09/2026). Lista, e não string, para incluir alguém sem mudar a lógica.
 */
const DONOS_DO_ESTIMATE = ["gabriel.santos@phdcontabil.com.br"];

export function podeDefinirEstimate(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && DONOS_DO_ESTIMATE.includes(e);
}

export function ehEstado(v: unknown): v is EstadoSprint {
  return v === "planejada" || v === "ativa" || v === "encerrada";
}

/** Valida "AAAA-MM-DD" antes de chegar no banco. */
export function ehData(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ------------------------------------------------------------------ sprints

export async function listarSprints(): Promise<(Sprint & { itens: number })[]> {
  const db = ticketsDb();
  if (!db) return [];

  const [{ data: sprints }, { data: itens }] = await Promise.all([
    db.from("ticket_sprints").select("*").order("inicio", { ascending: false }),
    db.from("ticket_sprint_itens").select("sprint_id"),
  ]);

  const conta = new Map<string, number>();
  for (const i of (itens ?? []) as { sprint_id: string }[]) {
    conta.set(i.sprint_id, (conta.get(i.sprint_id) ?? 0) + 1);
  }

  return ((sprints ?? []) as Sprint[]).map((s) => ({ ...s, itens: conta.get(s.id) ?? 0 }));
}

export async function obterSprint(id: string): Promise<Sprint | null> {
  const db = ticketsDb();
  if (!db) return null;
  const { data } = await db.from("ticket_sprints").select("*").eq("id", id).maybeSingle();
  return (data as Sprint) ?? null;
}

/**
 * Sprint que a tela abre por padrão: a ativa; senão a planejada mais próxima;
 * senão a última encerrada. Quem chega na tela quer ver o ciclo corrente.
 */
export async function sprintPadrao(): Promise<Sprint | null> {
  const db = ticketsDb();
  if (!db) return null;

  const { data: ativa } = await db
    .from("ticket_sprints").select("*").eq("estado", "ativa")
    .order("inicio", { ascending: false }).limit(1).maybeSingle();
  if (ativa) return ativa as Sprint;

  const { data: planejada } = await db
    .from("ticket_sprints").select("*").eq("estado", "planejada")
    .order("inicio", { ascending: true }).limit(1).maybeSingle();
  if (planejada) return planejada as Sprint;

  const { data: ultima } = await db
    .from("ticket_sprints").select("*")
    .order("inicio", { ascending: false }).limit(1).maybeSingle();
  return (ultima as Sprint) ?? null;
}

export async function criarSprint(
  campos: { nome: string; inicio: string; fim: string; objetivo?: string | null },
  email: string
): Promise<{ id?: string; error: string | null }> {
  const db = ticketsDb();
  if (!db) return { error: "Banco indisponível." };
  const { data, error } = await db
    .from("ticket_sprints")
    .insert({
      nome: campos.nome,
      inicio: campos.inicio,
      fim: campos.fim,
      objetivo: campos.objetivo ?? null,
      criada_por: email,
    })
    .select("id")
    .single();
  return { id: (data as { id: string } | null)?.id, error: error?.message ?? null };
}

export async function atualizarSprint(
  id: string,
  campos: Partial<Pick<Sprint, "nome" | "inicio" | "fim" | "estado" | "objetivo">>
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";

  // Só uma sprint ativa por vez: com duas, "o que estamos fazendo agora"
  // passaria a ter duas respostas e o capacity perderia o sentido.
  if (campos.estado === "ativa") {
    await db.from("ticket_sprints").update({ estado: "planejada" })
      .eq("estado", "ativa").neq("id", id);
  }

  const { error } = await db
    .from("ticket_sprints")
    .update({ ...campos, atualizada_em: new Date().toISOString() })
    .eq("id", id);
  return error?.message ?? null;
}

export async function excluirSprint(id: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  // Itens e capacidade caem por cascade; os tickets em si não são tocados.
  const { error } = await db.from("ticket_sprints").delete().eq("id", id);
  return error?.message ?? null;
}

// -------------------------------------------------------------------- itens

export async function listarItens(sprintId: string): Promise<ItemSprint[]> {
  const db = ticketsDb();
  if (!db) return [];

  const { data: itens } = await db
    .from("ticket_sprint_itens")
    .select("sprint_id,ticket_id,responsavel_email,horas_planejadas,ordem")
    .eq("sprint_id", sprintId)
    .order("ordem", { ascending: true });

  const linhas = (itens ?? []) as Omit<ItemSprint, "ticket" | "segundosExecutados" | "horasApontadas" | "apontamentos">[];
  if (linhas.length === 0) return [];

  const ids = linhas.map((i) => i.ticket_id);
  const [{ data: tickets }, { data: execs }, { data: resp }] = await Promise.all([
    db.from("tickets")
      .select("id,numero,incidente,title,description,sector,status,priority,position,created_by_email,created_by_name,created_at,updated_at,closed_at,horas_estimadas,horas_realizadas,ganho_horas_mes,valor_hora,ganho_mensal")
      .in("id", ids),
    db.from("ticket_execucoes")
      .select("id,ticket_id,email,inicio,segundos,comentario,data")
      .in("ticket_id", ids)
      .order("data", { ascending: false }),
    db.from("ticket_assignees").select("ticket_id,user_email,user_name").in("ticket_id", ids),
  ]);

  const respPorTicket = new Map<string, { user_email: string; user_name: string | null }[]>();
  for (const r of (resp ?? []) as { ticket_id: string; user_email: string; user_name: string | null }[]) {
    const lista = respPorTicket.get(r.ticket_id) ?? [];
    lista.push({ user_email: r.user_email, user_name: r.user_name });
    respPorTicket.set(r.ticket_id, lista);
  }

  const porTicket = new Map<string, Ticket>();
  for (const t of (tickets ?? []) as unknown as Record<string, unknown>[]) {
    const id = t.id as string;
    porTicket.set(id, {
      ...(t as unknown as Ticket),
      responsaveis: respPorTicket.get(id) ?? [],
      qtdComentarios: 0,
      qtdAnexos: 0,
    });
  }

  type LinhaExec = {
    id: string; ticket_id: string; email: string; inicio: string;
    segundos: number | null; comentario: string | null; data: string;
  };

  const tempo = new Map<string, number>();
  const lancamentos = new Map<string, Apontamento[]>();

  for (const e of (execs ?? []) as LinhaExec[]) {
    const seg = e.segundos ?? 0;
    tempo.set(e.ticket_id, (tempo.get(e.ticket_id) ?? 0) + seg);

    const lista = lancamentos.get(e.ticket_id) ?? [];
    lista.push({
      id: e.id,
      ticket_id: e.ticket_id,
      email: e.email,
      data: e.data,
      segundos: seg,
      horas: Math.round((seg / 3600) * 100) / 100,
      comentario: e.comentario,
      inicio: e.inicio,
    });
    lancamentos.set(e.ticket_id, lista);
  }

  return linhas.map((i) => ({
    ...i,
    horas_planejadas: n(i.horas_planejadas),
    ticket: porTicket.get(i.ticket_id) ?? null,
    segundosExecutados: tempo.get(i.ticket_id) ?? 0,
    horasApontadas: Math.round(((tempo.get(i.ticket_id) ?? 0) / 3600) * 100) / 100,
    apontamentos: lancamentos.get(i.ticket_id) ?? [],
  }));
}

export async function adicionarItem(
  sprintId: string,
  ticketId: string,
  campos: { responsavel_email?: string | null; horas_planejadas?: number | null },
  email: string
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";

  const { data: ja } = await db
    .from("ticket_sprint_itens").select("sprint_id").eq("ticket_id", ticketId).maybeSingle();
  if (ja && (ja as { sprint_id: string }).sprint_id !== sprintId) {
    return "Este cartão já está em outra sprint.";
  }

  const { data: ultimo } = await db
    .from("ticket_sprint_itens").select("ordem").eq("sprint_id", sprintId)
    .order("ordem", { ascending: false }).limit(1).maybeSingle();

  const { error } = await db.from("ticket_sprint_itens").upsert(
    {
      sprint_id: sprintId,
      ticket_id: ticketId,
      responsavel_email: campos.responsavel_email ?? null,
      horas_planejadas: campos.horas_planejadas ?? null,
      ordem: ((ultimo as { ordem: number } | null)?.ordem ?? 0) + 1,
      adicionado_por: email,
    },
    { onConflict: "sprint_id,ticket_id" }
  );
  return error?.message ?? null;
}

export async function atualizarItem(
  sprintId: string,
  ticketId: string,
  campos: { responsavel_email?: string | null; horas_planejadas?: number | null }
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";

  // Baixar o estimate abaixo do que já foi lançado deixaria o cartão estourado
  // por edição — exatamente o estado que a regra proíbe.
  if (campos.horas_planejadas !== undefined && campos.horas_planejadas !== null) {
    const { lancado } = await saldoDoCartao(ticketId);
    if (campos.horas_planejadas < lancado - 0.001) {
      return `Já foram lançadas ${lancado} h neste cartão — o Estimate não pode ficar abaixo disso.`;
    }
  }
  const { error } = await db
    .from("ticket_sprint_itens").update(campos)
    .eq("sprint_id", sprintId).eq("ticket_id", ticketId);
  return error?.message ?? null;
}

export async function removerItem(sprintId: string, ticketId: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  const { error } = await db
    .from("ticket_sprint_itens").delete()
    .eq("sprint_id", sprintId).eq("ticket_id", ticketId);
  return error?.message ?? null;
}

// --------------------------------------------------------------- capacidade

export async function listarCapacidade(sprintId: string): Promise<CapacidadeLinha[]> {
  const db = ticketsDb();
  if (!db) return [];
  const { data } = await db
    .from("ticket_sprint_capacidade").select("*").eq("sprint_id", sprintId);
  return ((data ?? []) as CapacidadeLinha[]).map((c) => ({
    ...c,
    horas_dia: Number(c.horas_dia ?? 0),
    horas_incidente: Number(c.horas_incidente ?? 0),
  }));
}

export async function salvarCapacidade(
  sprintId: string,
  email: string,
  campos: { horas_dia?: number; horas_incidente?: number }
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  const { data: atual } = await db
    .from("ticket_sprint_capacidade").select("horas_dia,horas_incidente")
    .eq("sprint_id", sprintId).eq("email", email).maybeSingle();
  const base = (atual as { horas_dia: number; horas_incidente: number } | null)
    ?? { horas_dia: 6, horas_incidente: 0 };

  const { error } = await db.from("ticket_sprint_capacidade").upsert(
    {
      sprint_id: sprintId,
      email,
      horas_dia: campos.horas_dia ?? base.horas_dia,
      horas_incidente: campos.horas_incidente ?? base.horas_incidente,
    },
    { onConflict: "sprint_id,email" }
  );
  return error?.message ?? null;
}

// ------------------------------------------------------------------ folgas

export async function listarFolgas(sprintId: string): Promise<FolgaSprint[]> {
  const db = ticketsDb();
  if (!db) return [];
  const { data } = await db
    .from("ticket_sprint_folgas").select("*").eq("sprint_id", sprintId)
    .order("data", { ascending: true });
  return (data ?? []) as FolgaSprint[];
}

export async function adicionarFolga(
  sprintId: string,
  campos: { data: string; email: string | null; motivo: string | null },
  criadoPor: string
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  const { error } = await db.from("ticket_sprint_folgas").insert({
    sprint_id: sprintId,
    data: campos.data,
    email: campos.email,
    motivo: campos.motivo,
    criado_por: criadoPor,
  });
  // Violação de unicidade: o dia já está lançado, o que não é erro do usuário.
  if (error && error.code === "23505") return "Esse dia já está lançado.";
  return error?.message ?? null;
}

/**
 * Lança um intervalo de dias de uma vez — férias raramente são um dia só.
 * Dias que já existem são ignorados, não impedem o resto.
 */
export async function adicionarFolgaPeriodo(
  sprintId: string,
  campos: { de: string; ate: string; email: string | null; motivo: string | null },
  criadoPor: string
): Promise<{ criados: number; error: string | null }> {
  const db = ticketsDb();
  if (!db) return { criados: 0, error: "Banco indisponível." };

  const dias = datasUteis(campos.de, campos.ate);
  if (dias.length === 0) return { criados: 0, error: "Nenhum dia útil nesse período." };

  // Nada de upsert aqui. Os índices que impedem o dia repetido são PARCIAIS
  // (um para `email is null`, outro para `email is not null`), e o Postgres não
  // casa ON CONFLICT com índice parcial sem repetir o predicado — coisa que o
  // PostgREST não sabe expressar. Então descobrimos o que já existe e
  // inserimos só o que falta, que é determinístico e não depende de conflito.
  let jaTem = db
    .from("ticket_sprint_folgas")
    .select("data")
    .eq("sprint_id", sprintId)
    .in("data", dias);
  jaTem = campos.email ? jaTem.eq("email", campos.email) : jaTem.is("email", null);

  const { data: existentes, error: erroLeitura } = await jaTem;
  if (erroLeitura) return { criados: 0, error: erroLeitura.message };

  const tem = new Set(((existentes ?? []) as { data: string }[]).map((x) => x.data));
  const novos = dias.filter((d) => !tem.has(d));
  if (novos.length === 0) {
    return { criados: 0, error: "Esses dias já estavam lançados." };
  }

  const { error } = await db.from("ticket_sprint_folgas").insert(
    novos.map((d) => ({
      sprint_id: sprintId,
      data: d,
      email: campos.email,
      motivo: campos.motivo,
      criado_por: criadoPor,
    }))
  );
  return { criados: novos.length, error: error?.message ?? null };
}

export async function removerFolga(id: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  const { error } = await db.from("ticket_sprint_folgas").delete().eq("id", id);
  return error?.message ?? null;
}

// ------------------------------------------------------------ apontamentos

/**
 * Quanto ainda cabe no cartão, em horas.
 *
 * Regra do time: o cartão NÃO estoura. Se o trabalho passou do previsto, a
 * decisão é abrir outro cartão — assim o excedente aparece como escopo novo,
 * que é o que ele é, em vez de sumir dentro de uma estimativa que ficou
 * errada. Por isso a conta é feita aqui no servidor: travar só na tela deixaria
 * a regra passar por qualquer requisição direta.
 *
 * Devolve `null` quando o cartão ainda não tem estimate — sem teto não há como
 * dizer o que é estouro, e lançar às cegas é justamente o que queremos evitar.
 */
export async function saldoDoCartao(
  ticketId: string
): Promise<{ estimate: number | null; lancado: number; saldo: number | null }> {
  const db = ticketsDb();
  if (!db) return { estimate: null, lancado: 0, saldo: null };

  const [{ data: item }, { data: execs }] = await Promise.all([
    db.from("ticket_sprint_itens").select("horas_planejadas").eq("ticket_id", ticketId).maybeSingle(),
    db.from("ticket_execucoes").select("segundos").eq("ticket_id", ticketId),
  ]);

  const estimate = n((item as { horas_planejadas: number | null } | null)?.horas_planejadas);
  let segundos = 0;
  for (const e of (execs ?? []) as { segundos: number | null }[]) {
    segundos += e.segundos ?? 0;
  }
  const lancado = Math.round((segundos / 3600) * 100) / 100;

  return {
    estimate,
    lancado,
    saldo: estimate === null ? null : Math.round((estimate - lancado) * 100) / 100,
  };
}

/**
 * Lançamento manual de horas: "trabalhei 3h no dia 19".
 *
 * Cai na mesma tabela do cronômetro, com `manual = true`. O cartão soma os
 * dois numa lista só, e `horas_realizadas` do ticket acompanha — é o número
 * que o resto do sistema já usa.
 */
export async function lancarHoras(
  ticketId: string,
  sprintId: string | null,
  email: string,
  campos: { data: string; horas: number; comentario: string | null }
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";

  if (!horaValida(campos.horas)) {
    return `O apontamento vai de ${PASSO_HORAS * 60} em ${PASSO_HORAS * 60} minutos — `
      + "use 0,5, 1, 1,5 e assim por diante.";
  }
  const segundos = Math.max(0, Math.round(campos.horas * 3600));
  if (segundos === 0) return "Informe quantas horas foram gastas.";

  const { estimate, lancado, saldo } = await saldoDoCartao(ticketId);
  if (estimate === null || estimate <= 0) {
    return "Defina o Estimate do cartão antes de lançar horas.";
  }
  if (saldo !== null && campos.horas > saldo + 0.001) {
    return saldo <= 0
      ? `Este cartão já consumiu as ${estimate} h previstas. Abra outro cartão para o que falta.`
      : `Restam só ${saldo} h neste cartão (${lancado} h de ${estimate} h já lançadas). `
        + "Lance até esse limite e abra outro cartão para o excedente.";
  }

  // inicio/fim marcam o registro, não o relógio: o que vale é `data`.
  const agora = new Date().toISOString();
  const { error } = await db.from("ticket_execucoes").insert({
    ticket_id: ticketId,
    sprint_id: sprintId,
    email,
    inicio: agora,
    fim: agora,
    segundos,
    data: campos.data,
    comentario: campos.comentario,
    manual: true,
  });
  if (error) return error.message;

  await somarNoTicket(ticketId, Math.round((segundos / 3600) * 100) / 100);
  return null;
}

export async function apagarApontamento(id: string, email: string, podeTudo: boolean): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";

  const { data } = await db
    .from("ticket_execucoes").select("id,ticket_id,email,segundos").eq("id", id).maybeSingle();
  const linha = data as { ticket_id: string; email: string; segundos: number | null } | null;
  if (!linha) return "Lançamento não encontrado.";
  if (!podeTudo && linha.email.toLowerCase() !== email.toLowerCase()) {
    return "Só quem lançou pode apagar.";
  }

  const { error } = await db.from("ticket_execucoes").delete().eq("id", id);
  if (error) return error.message;

  // Devolve as horas: apagar o lançamento sem descontar deixaria o total
  // maior do que a soma da lista, e ninguém entenderia a diferença.
  await somarNoTicket(linha.ticket_id, -Math.round(((linha.segundos ?? 0) / 3600) * 100) / 100);
  return null;
}

/** Soma (ou desconta) horas em `tickets.horas_realizadas`, sem deixar negativo. */
async function somarNoTicket(ticketId: string, horas: number): Promise<void> {
  const db = ticketsDb();
  if (!db || horas === 0) return;
  const { data } = await db
    .from("tickets").select("horas_realizadas").eq("id", ticketId).maybeSingle();
  const antes = Number((data as { horas_realizadas: number | null } | null)?.horas_realizadas ?? 0);
  const total = Math.max(0, Math.round((antes + horas) * 100) / 100);
  await db.from("tickets").update({ horas_realizadas: total }).eq("id", ticketId);
}

export async function removerCapacidade(sprintId: string, email: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco indisponível.";
  const { error } = await db
    .from("ticket_sprint_capacidade").delete().eq("sprint_id", sprintId).eq("email", email);
  return error?.message ?? null;
}

// ----------------------------------------------------------------- backlog

/**
 * Cartões que podem entrar na sprint: tudo que está em aberto em qualquer
 * setor e ainda não foi puxado para nenhum ciclo. É este o "backlog de todas
 * as equipes" — a sprint enxerga o escritório inteiro, não só o TI.
 */
export async function backlogDisponivel(limite = 300): Promise<Ticket[]> {
  const db = ticketsDb();
  if (!db) return [];

  const { data: emSprint } = await db.from("ticket_sprint_itens").select("ticket_id");
  const usados = new Set(((emSprint ?? []) as { ticket_id: string }[]).map((i) => i.ticket_id));

  const { data } = await db
    .from("tickets")
    .select("id,numero,incidente,title,description,sector,status,priority,position,created_by_email,created_by_name,created_at,updated_at,closed_at,horas_estimadas,horas_realizadas,ganho_horas_mes,valor_hora,ganho_mensal")
    .neq("status", "finalizado")
    .order("created_at", { ascending: false })
    .limit(limite + usados.size);

  const linhas = (data ?? []) as unknown as Record<string, unknown>[];
  return linhas
    .filter((t) => !usados.has(t.id as string))
    .slice(0, limite)
    .map((t) => ({
      ...(t as unknown as Ticket),
      responsaveis: [],
      qtdComentarios: 0,
      qtdAnexos: 0,
    }));
}

/** Dias úteis da sprint — atalho para as telas não recalcularem por conta. */
export function diasUteisDaSprint(s: Pick<Sprint, "inicio" | "fim">): number {
  return diasUteis(s.inicio, s.fim);
}
