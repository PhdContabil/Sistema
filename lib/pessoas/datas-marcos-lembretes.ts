// Datas e Marcos — lembretes por e-mail e sincronização da admissão com o Questor.
// SERVIDOR.
//
// Três lembretes, todos ligados/desligados em lembretes_config (nascem desligados):
//   • resumo_mes   — dia 01: aniversariantes e tempo de casa do mês;
//   • tempo_casa   — no dia em que alguém completa tempo de casa (1 ano e múltiplos de 5 em destaque);
//   • experiencia  — N dias antes de completar 90 dias de casa (padrão: 7).
//
// Só e-mail por ora (Teams fica para depois). Cada lembrete é registrado em
// lembretes_enviados (chave + referência): rodar o job de novo no mesmo dia não
// repete o envio.
import { admin } from "./ferias";
import { enviarEmail, layoutEmail } from "./notificar";
import { getFuncionariosAtivos } from "../questor";
import { carregarLembretes, carregarPessoasDatas, type LembreteConfig } from "./datas-marcos-dados";
import {
  aniversariantesDoMes, fimExperienciaEm, hojeSP, MESES, partes, rotuloAnos, somaDias, tempoDeCasaDoMes,
  type PessoaDatas, type TempoDeCasaMes,
} from "./datas-marcos";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
const LINK_AREA = `${BASE}/m/pessoas/datas-marcos`;
const LINK_AGENDA = `${BASE}/m/pessoas/agenda`;

const p2 = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function dataBR(iso: string) { const { a, m, d } = partes(iso); return `${p2(d)}/${p2(m)}/${a}`; }

const TH = "padding:8px 6px;border-bottom:1px solid #e5e9ef;text-align:left;font-size:11px;text-transform:uppercase;color:#68717e";
const TD = "padding:8px 6px;border-bottom:1px solid #e5e9ef;font-size:14px";
const TD_MARCO = `${TD};background:#fff6dc`;
const SELO = '<span style="background:#f59e0b;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:6px">⭐ marco</span>';

function tabelaAniversariantes(ano: number, mes: number, pessoas: PessoaDatas[]) {
  const lista = aniversariantesDoMes(ano, mes, pessoas);
  if (!lista.length) return `<p style="color:#68717e"><em>Nenhum aniversariante neste mês.</em></p>`;
  return `<table style="width:100%;border-collapse:collapse"><tr><th style="${TH}">Dia</th><th style="${TH}">Colaborador</th></tr>${
    lista.map((x) => `<tr><td style="${TD}">${p2(x.dia)}/${p2(mes)}</td><td style="${TD}">${esc(x.nome)}</td></tr>`).join("")}</table>`;
}

function tabelaTempoDeCasa(mes: number, lista: TempoDeCasaMes[]) {
  if (!lista.length) return `<p style="color:#68717e"><em>Ninguém faz aniversário de empresa neste mês.</em></p>`;
  return `<table style="width:100%;border-collapse:collapse"><tr><th style="${TH}">Dia</th><th style="${TH}">Colaborador</th><th style="${TH}">Tempo</th></tr>${
    lista.map((x) => {
      const td = x.marco ? TD_MARCO : TD;
      return `<tr><td style="${td}">${p2(x.dia)}/${p2(mes)}</td><td style="${td}">${esc(x.nome)}</td><td style="${td}">${rotuloAnos(x.anos)}${x.marco ? SELO : ""}</td></tr>`;
    }).join("")}</table>`;
}

export interface EmailMontado { assunto: string; html: string }

/** Resumo do mês: aniversariantes e tempo de casa. */
export function montarResumoMes(ano: number, mes: number, pessoas: PessoaDatas[]): EmailMontado {
  const nome = MESES[mes - 1];
  const html = layoutEmail(
    `${nome.charAt(0).toUpperCase()}${nome.slice(1)} na PHD`,
    `<p>Resumo do mês para você não deixar passar nenhuma data.</p>
     <h3 style="margin:18px 0 4px;font-size:15px">🎂 Aniversariantes</h3>${tabelaAniversariantes(ano, mes, pessoas)}
     <h3 style="margin:18px 0 4px;font-size:15px">🏢 Tempo de casa</h3>${tabelaTempoDeCasa(mes, tempoDeCasaDoMes(ano, mes, pessoas))}`,
    { texto: "Ver na agenda", url: LINK_AGENDA }
  );
  return { assunto: `Pessoas: aniversariantes e tempo de casa de ${nome}`, html };
}

/** Quem completa tempo de casa hoje. */
export function montarTempoDeCasa(hoje: string, lista: TempoDeCasaMes[]): EmailMontado {
  const marcos = lista.filter((x) => x.marco);
  const unico = lista.length === 1 ? lista[0] : null;
  const assunto = unico
    ? `Hoje: ${unico.nome} completa ${rotuloAnos(unico.anos)} de PHD${unico.marco ? " ⭐" : ""}`
    : `Hoje: ${lista.length} colaboradores completam tempo de casa${marcos.length ? " ⭐" : ""}`;
  const linhas = lista.map((x) =>
    `<p style="margin:0 0 8px"><strong>${esc(x.nome)}</strong> completa hoje <strong>${rotuloAnos(x.anos)} de PHD</strong>${x.marco ? SELO : ""}.</p>`).join("");
  const html = layoutEmail(
    marcos.length ? "⭐ Tempo de casa" : "Tempo de casa",
    `${linhas}<p style="color:#68717e">Marcos de 1 ano e de 5 em 5 anos recebem destaque. ${esc(dataBR(hoje))}.</p>`,
    { texto: "Ver na agenda", url: LINK_AGENDA }
  );
  return { assunto, html };
}

/** Fim do período de experiência (90 dias). */
export function montarFimExperiencia(hoje: string, lista: PessoaDatas[]): EmailMontado {
  const dias = (p: PessoaDatas) => Math.round((Date.parse(`${p.fim_experiencia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
  const d0 = lista.length ? dias(lista[0]) : 0;
  const quando = d0 <= 0 ? "termina hoje" : d0 === 1 ? "termina amanhã" : `termina em ${d0} dias`;
  const assunto = lista.length === 1
    ? `Experiência ${quando}: ${lista[0].nome}`
    : `Experiência ${quando}: ${lista.length} colaboradores`;
  const linhas = lista.map((p) =>
    `<tr><td style="${TD}">${esc(p.nome)}</td><td style="${TD}">${p.data_admissao ? dataBR(p.data_admissao) : "—"}</td><td style="${TD_MARCO}"><strong>${p.fim_experiencia ? dataBR(p.fim_experiencia) : "—"}</strong></td></tr>`).join("");
  const html = layoutEmail(
    "Fim do período de experiência",
    `<table style="width:100%;border-collapse:collapse"><tr><th style="${TH}">Colaborador</th><th style="${TH}">Admissão</th><th style="${TH}">Fim (90 dias)</th></tr>${linhas}</table>
     <p>Hora de registrar a avaliação do período de experiência.</p>`,
    { texto: "Abrir Datas e Marcos", url: LINK_AREA }
  );
  return { assunto, html };
}

// ---------------------------------------------------------------- envio

async function enviarParaTodos(destinos: string[], email: EmailMontado, prefixo = "") {
  let ok = 0, falhas = 0;
  // Um destinatário por vez: o Graph limita envios simultâneos da mesma caixa.
  for (const para of destinos) {
    (await enviarEmail(para, `${prefixo}${email.assunto}`, email.html)) ? ok++ : falhas++;
  }
  return { ok, falhas };
}

export interface ResultadoLembrete { chave: string; referencia: string; enviados: number; falhas: number }

/**
 * Registra o envio ANTES de mandar: se outra execução já pegou, não repete.
 * Devolve false quando a referência já foi enviada.
 */
async function reservar(chave: string, referencia: string): Promise<boolean> {
  const sb = admin();
  if (!sb) return false;
  const { error } = await sb.from("lembretes_enviados").insert({ chave, referencia });
  return !error; // 23505 (duplicada) => já enviado
}

async function registrarResultado(chave: string, referencia: string, texto: string) {
  const sb = admin();
  if (sb) await sb.from("lembretes_enviados").update({ resultado: texto }).eq("chave", chave).eq("referencia", referencia);
}

/** Job diário: decide e envia os lembretes de hoje. */
export async function executarLembretes(hoje: string = hojeSP()): Promise<{
  sincronizacao: ResultadoSincronizacao | { erro: string };
  enviados: ResultadoLembrete[];
}> {
  let sincronizacao: ResultadoSincronizacao | { erro: string };
  try { sincronizacao = await sincronizarAdmissoesQuestor(); }
  catch (e) { sincronizacao = { erro: e instanceof Error ? e.message : "falha na sincronização" }; }

  const [config, pessoas] = await Promise.all([carregarLembretes(), carregarPessoasDatas()]);
  const enviados: ResultadoLembrete[] = [];
  const { a: ano, m: mes, d: dia } = partes(hoje);

  for (const c of config.filter((x) => x.ativo && x.destinatarios.length)) {
    let email: EmailMontado | null = null;
    let referencia = "";

    if (c.chave === "resumo_mes" && dia === 1) {
      referencia = `${ano}-${p2(mes)}`;
      if (aniversariantesDoMes(ano, mes, pessoas).length || tempoDeCasaDoMes(ano, mes, pessoas).length) {
        email = montarResumoMes(ano, mes, pessoas);
      }
    } else if (c.chave === "tempo_casa") {
      referencia = hoje;
      const hojeLista = tempoDeCasaDoMes(ano, mes, pessoas).filter((x) => x.dia === dia);
      if (hojeLista.length) email = montarTempoDeCasa(hoje, hojeLista);
    } else if (c.chave === "experiencia") {
      const alvo = somaDias(hoje, c.antecedencia_dias);
      referencia = alvo;
      const lista = fimExperienciaEm(alvo, pessoas);
      if (lista.length) email = montarFimExperiencia(hoje, lista);
    }

    if (!email || !referencia) continue;
    if (!(await reservar(c.chave, referencia))) continue; // já enviado
    const r = await enviarParaTodos(c.destinatarios, email);
    await registrarResultado(c.chave, referencia, `${r.ok}/${c.destinatarios.length} e-mails`);
    enviados.push({ chave: c.chave, referencia, enviados: r.ok, falhas: r.falhas });
  }
  return { sincronizacao, enviados };
}

/**
 * Prévia: manda o lembrete só para quem pediu, com dados reais de hoje, sem
 * registrar envio. Serve para ver como chega antes de ligar o lembrete.
 */
export async function enviarPreviaLembrete(chave: string, para: string, hoje: string = hojeSP()): Promise<{ ok: boolean; assunto: string }> {
  const pessoas = await carregarPessoasDatas();
  const { a: ano, m: mes } = partes(hoje);
  let email: EmailMontado;
  if (chave === "resumo_mes") {
    email = montarResumoMes(ano, mes, pessoas);
  } else if (chave === "tempo_casa") {
    // Hoje pode não ter ninguém: usa o próximo aniversário de empresa do mês.
    const lista = tempoDeCasaDoMes(ano, mes, pessoas);
    const prox = lista.find((x) => x.dia >= partes(hoje).d) ?? lista[0];
    if (!prox) throw new Error("Ninguém faz aniversário de empresa neste mês para montar a prévia.");
    email = montarTempoDeCasa(`${ano}-${p2(mes)}-${p2(prox.dia)}`, lista.filter((x) => x.dia === prox.dia));
  } else if (chave === "experiencia") {
    const ativos = pessoas.filter((p) => p.ativo && p.fim_experiencia && p.fim_experiencia >= hoje)
      .sort((x, y) => (x.fim_experiencia ?? "").localeCompare(y.fim_experiencia ?? ""));
    if (!ativos.length) throw new Error("Ninguém está em período de experiência agora para montar a prévia.");
    email = montarFimExperiencia(hoje, [ativos[0]]);
  } else {
    throw new Error("Lembrete desconhecido.");
  }
  const ok = await enviarEmail(para, `[Prévia] ${email.assunto}`, email.html);
  return { ok, assunto: email.assunto };
}

export type { LembreteConfig };

// ------------------------------------------------- sincronização Questor

export interface ResultadoSincronizacao {
  /** Pessoas ativas com código do Questor preenchido. */
  vinculados: number;
  /** Admissões gravadas ou corrigidas nesta rodada. */
  atualizados: number;
  /** Pessoas ativas sem código do Questor (não dá para puxar a admissão). */
  semVinculo: string[];
  /** Código do Questor que não achou funcionário ativo, ou achou mais de um. */
  semCorrespondencia: string[];
}

/**
 * Puxa a data de admissão do Questor (GET /rh/funcionarios-ativos) e grava em
 * pessoas_datas, sobrescrevendo a da planilha quando diferir. A ligação é o
 * código do funcionário em pessoas_perfil.questor_codigofunc: sem ele a pessoa
 * não é atualizada e aparece em `semVinculo`.
 */
export async function sincronizarAdmissoesQuestor(): Promise<ResultadoSincronizacao> {
  const sb = admin();
  if (!sb) throw new Error("Banco indisponível.");
  const { data: perfis } = await sb.from("pessoas_perfil")
    .select("id,nome,questor_codigofunc").eq("ativo", true).neq("modelo", true);
  const lista = (perfis ?? []) as { id: number; nome: string; questor_codigofunc: number | null }[];

  const res: ResultadoSincronizacao = { vinculados: 0, atualizados: 0, semVinculo: [], semCorrespondencia: [] };
  const comCodigo = lista.filter((p) => p.questor_codigofunc != null);
  res.semVinculo = lista.filter((p) => p.questor_codigofunc == null).map((p) => p.nome);
  if (!comCodigo.length) return res;

  const questor = await getFuncionariosAtivos();
  const porCodigo = new Map<number, string[]>();
  for (const f of questor.dados ?? []) {
    const d = (f.dataadm ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    porCodigo.set(f.codigofunccontr, [...(porCodigo.get(f.codigofunccontr) ?? []), d]);
  }

  const { data: atuais } = await sb.from("pessoas_datas").select("pessoa_id,data_admissao");
  const atual = new Map((atuais ?? []).map((r: { pessoa_id: number; data_admissao: string | null }) => [r.pessoa_id, r.data_admissao]));

  for (const p of comCodigo) {
    const datas = Array.from(new Set(porCodigo.get(p.questor_codigofunc as number) ?? []));
    if (datas.length !== 1) { res.semCorrespondencia.push(p.nome); continue; }
    res.vinculados++;
    if (atual.get(p.id) === datas[0]) continue;
    const { error } = await sb.from("pessoas_datas").upsert(
      { pessoa_id: p.id, data_admissao: datas[0], admissao_origem: "questor", atualizado_em: new Date().toISOString() },
      { onConflict: "pessoa_id" }
    );
    if (!error) res.atualizados++;
  }
  return res;
}
