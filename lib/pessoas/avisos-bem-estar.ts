// Aviso automático de eventos de Bem-Estar (agenda tipo "bem_estar").
//
// Mesma estrutura das férias (lib/pessoas/notificar.ts):
//   • e-mail para cada colaborador ativo com e-mail cadastrado;
//   • mensagem no Teams de cada um (Power Automate / relay, o que estiver ligado);
//   • um aviso no canal do Teams (webhook), quando configurado.
//
// Cada evento é avisado UMA vez: aviso_enviado_em marca o envio. Evento com
// avisar = false fica segurado (não sai aviso) até alguém liberar.
import { admin } from "./ferias";
import { enviarEmail, notificarTeams, avisarCanal, layoutEmail } from "./notificar";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
const LINK = `${BASE}/m/pessoas/agenda`;

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function periodo(inicio: string, fim: string) {
  return inicio === fim ? dataBR(inicio) : `${dataBR(inicio)} a ${dataBR(fim)}`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface EventoAviso { id: number; titulo: string; inicio: string; fim: string; detalhe: string | null }

/** Assunto, texto do Teams e HTML do e-mail de um evento. */
function montarAviso(ev: EventoAviso) {
  const quando = periodo(ev.inicio, ev.fim);
  const titulo = `Bem-Estar: ${ev.titulo}`;
  const mensagem = `${ev.titulo} — ${quando}.${ev.detalhe ? ` ${ev.detalhe}` : ""}`;
  const html = layoutEmail(
    esc(ev.titulo),
    `<p><strong>Quando:</strong> ${quando}</p>${ev.detalhe ? `<p>${esc(ev.detalhe)}</p>` : ""}
     <p>O compromisso já está na agenda do Núcleo.</p>`,
    { texto: "Ver na agenda", url: LINK }
  );
  return { quando, titulo, mensagem, html };
}

/**
 * Prévia: manda o aviso de um evento só para um e-mail (quem pediu), sem
 * marcar o evento como avisado. Serve para ver como chega antes de soltar.
 */
export async function enviarPreviaBemEstar(eventoId: number, para: string) {
  const sb = admin();
  if (!sb) throw new Error("Banco indisponível.");
  const { data: ev } = await sb.from("eventos_agenda")
    .select("id,titulo,inicio,fim,detalhe").eq("id", eventoId).eq("tipo", "bem_estar").maybeSingle();
  if (!ev) throw new Error("Evento de Bem-Estar não encontrado.");
  const { titulo, mensagem, html } = montarAviso(ev as EventoAviso);
  const [email, teams] = await Promise.all([
    enviarEmail(para, `[Prévia] ${titulo}`, html),
    notificarTeams(para, `[Prévia] ${titulo}`, mensagem, LINK),
  ]);
  return { email, teams, para, evento: ev.titulo };
}

export interface ResultadoAvisos {
  eventos: { id: number; titulo: string; emails: number; teams: number; canal: boolean; falhas: number }[];
}

/** Envia os avisos pendentes. `soEvento` restringe a um evento (envio manual). */
export async function avisarEventosBemEstar(soEvento?: number): Promise<ResultadoAvisos> {
  const sb = admin();
  if (!sb) throw new Error("Banco indisponível.");
  const hoje = new Date().toISOString().slice(0, 10);

  let q = sb.from("eventos_agenda")
    .select("id,titulo,inicio,fim,detalhe")
    .eq("tipo", "bem_estar").eq("avisar", true).is("aviso_enviado_em", null)
    .gte("fim", hoje).order("inicio");
  if (soEvento) q = q.eq("id", soEvento);
  const { data: eventos, error } = await q;
  if (error) throw new Error(error.message);
  if (!eventos?.length) return { eventos: [] };

  const { data: pessoas } = await sb.from("pessoas_perfil")
    .select("nome,email").eq("ativo", true).not("email", "is", null).neq("modelo", true);
  const destinos = [...new Map((pessoas ?? [])
    .filter((p) => p.email && p.email.includes("@"))
    .map((p) => [p.email.toLowerCase(), p.nome as string])).entries()];

  const resultado: ResultadoAvisos = { eventos: [] };
  for (const ev of eventos) {
    // Marca antes de enviar: se a função cair no meio, não repete o disparo
    // para quem já recebeu na próxima rodada.
    const { data: preso } = await sb.from("eventos_agenda")
      .update({ aviso_enviado_em: new Date().toISOString() })
      .eq("id", ev.id).is("aviso_enviado_em", null).select("id");
    if (!preso?.length) continue; // outra execução já pegou

    const { quando, titulo, mensagem, html } = montarAviso(ev);

    let emails = 0, teams = 0, falhas = 0;
    // Lotes de 5 pessoas em paralelo: cabe no tempo da função sem estourar o Graph.
    for (let i = 0; i < destinos.length; i += 5) {
      const lote = await Promise.all(destinos.slice(i, i + 5).map(([email]) => Promise.all([
        enviarEmail(email, titulo, html),
        notificarTeams(email, titulo, mensagem, LINK),
      ])));
      for (const [e, t] of lote) {
        if (e) emails++; else falhas++;
        if (t) teams++;
      }
    }
    const canal = await avisarCanal(`📅 ${titulo} — ${quando}. ${LINK}`);

    await sb.from("eventos_agenda").update({
      aviso_resultado: `${emails}/${destinos.length} e-mails, ${teams} Teams, canal ${canal ? "ok" : "não"}`,
    }).eq("id", ev.id);
    resultado.eventos.push({ id: ev.id, titulo: ev.titulo, emails, teams, canal, falhas });
  }
  return resultado;
}
