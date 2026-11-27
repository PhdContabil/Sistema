// Datas e Marcos — avaliação do período de experiência. SERVIDOR.
//
// O encarregado do setor recebe por e-mail um link (token secreto, sem login) com um
// formulário curto. Ao enviar, Julia Rodrigues e Junior são notificados e registram a
// decisão na aba Experiência. Enquanto não responder, o encarregado é cobrado por e-mail.
import { randomBytes } from "node:crypto";
import { admin } from "./ferias";
import { layoutEmail } from "./notificar";
import { partes, type PessoaDatas } from "./datas-marcos";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
const p2 = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dataBR = (iso: string) => { const { a, m, d } = partes(iso); return `${p2(d)}/${p2(m)}/${a}`; };

export const RECOMENDACOES: Record<string, string> = {
  efetivar: "Efetivar",
  prorrogar: "Prorrogar a experiência",
  nao_efetivar: "Não efetivar",
};

export const CRITERIOS = [
  { campo: "nota_desempenho", rotulo: "Desempenho nas tarefas" },
  { campo: "nota_assiduidade", rotulo: "Assiduidade e pontualidade" },
  { campo: "nota_equipe", rotulo: "Trabalho em equipe" },
  { campo: "nota_aprendizado", rotulo: "Aprendizado e evolução" },
] as const;

export interface Avaliacao {
  id: number;
  pessoa_id: number;
  fim_experiencia: string;
  encarregado_email: string;
  encarregado_nome: string | null;
  token: string;
  criado_em: string;
  enviada_em: string | null;
  nota_desempenho: number | null;
  nota_assiduidade: number | null;
  nota_equipe: number | null;
  nota_aprendizado: number | null;
  pontos_fortes: string | null;
  pontos_melhorar: string | null;
  recomendacao: string | null;
  justificativa: string | null;
  decisao: string | null;
  decisao_por: string | null;
  decisao_em: string | null;
  /** Nome do colaborador avaliado e se ainda está ativo (vem do cadastro). */
  pessoa_nome: string;
  pessoa_ativa: boolean;
}

const COLUNAS = "id,pessoa_id,fim_experiencia,encarregado_email,encarregado_nome,token,criado_em,enviada_em,nota_desempenho,nota_assiduidade,nota_equipe,nota_aprendizado,pontos_fortes,pontos_melhorar,recomendacao,justificativa,decisao,decisao_por,decisao_em,pessoas_perfil(nome,ativo)";

type Linha = Omit<Avaliacao, "pessoa_nome" | "pessoa_ativa"> & {
  pessoas_perfil: { nome: string; ativo: boolean } | { nome: string; ativo: boolean }[] | null;
};

function paraAvaliacao(l: Linha): Avaliacao {
  const { pessoas_perfil, ...resto } = l;
  const perfil = Array.isArray(pessoas_perfil) ? pessoas_perfil[0] : pessoas_perfil;
  return { ...resto, pessoa_nome: perfil?.nome ?? "—", pessoa_ativa: Boolean(perfil?.ativo) };
}

export const linkAvaliacao = (token: string) => `${BASE}/avaliacao-experiencia/${token}`;
export const tokenValido = (t: string) => /^[a-f0-9]{48}$/.test(t);

export async function avaliacaoPorToken(token: string): Promise<Avaliacao | null> {
  const sb = admin();
  if (!sb || !tokenValido(token)) return null;
  const { data } = await sb.from("avaliacoes_experiencia").select(COLUNAS).eq("token", token).maybeSingle();
  return data ? paraAvaliacao(data as unknown as Linha) : null;
}

/** Todas as avaliações (histórico permanente), as mais recentes primeiro. */
export async function carregarAvaliacoes(): Promise<Avaliacao[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb.from("avaliacoes_experiencia").select(COLUNAS).order("fim_experiencia", { ascending: false });
  return ((data ?? []) as unknown as Linha[]).map(paraAvaliacao);
}

/** Avaliações ainda sem resposta do encarregado, de colaboradores ativos. */
export async function avaliacoesPendentes(): Promise<Avaliacao[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb.from("avaliacoes_experiencia").select(COLUNAS).is("enviada_em", null);
  return ((data ?? []) as unknown as Linha[]).map(paraAvaliacao).filter((a) => a.pessoa_ativa);
}

/**
 * Garante uma avaliação por colaborador e por encarregado do setor (mesma regra da
 * Hierarquia: quem tem "encarregado" marcado no setor da pessoa; ninguém avalia a si mesmo).
 * Devolve as avaliações e quem ficou sem encarregado com e-mail.
 */
export async function garantirAvaliacoes(lista: PessoaDatas[]): Promise<{ avaliacoes: Avaliacao[]; semEncarregado: PessoaDatas[] }> {
  const sb = admin();
  const avaliacoes: Avaliacao[] = [];
  const semEncarregado: PessoaDatas[] = [];
  if (!sb || !lista.length) return { avaliacoes, semEncarregado };

  const { data: perfisRaw } = await sb.from("pessoas_perfil").select("id,nome,setor,email,encarregado,ativo");
  const perfis = (perfisRaw ?? []) as { id: number; nome: string; setor: string; email: string | null; encarregado: boolean; ativo: boolean }[];

  for (const p of lista) {
    if (!p.fim_experiencia) continue;
    const setor = perfis.find((x) => x.id === p.pessoa_id)?.setor;
    const encs = perfis.filter((x) => x.setor === setor && x.encarregado && x.ativo && x.email && x.id !== p.pessoa_id);
    if (!encs.length) { semEncarregado.push(p); continue; }

    const { data: existentes } = await sb.from("avaliacoes_experiencia").select("encarregado_email").eq("pessoa_id", p.pessoa_id).eq("fim_experiencia", p.fim_experiencia);
    const jaTem = new Set(((existentes ?? []) as { encarregado_email: string }[]).map((e) => e.encarregado_email));
    for (const e of encs) {
      const email = e.email!.toLowerCase();
      if (jaTem.has(email)) continue;
      await sb.from("avaliacoes_experiencia").insert({
        pessoa_id: p.pessoa_id, fim_experiencia: p.fim_experiencia,
        encarregado_email: email, encarregado_nome: e.nome, token: randomBytes(24).toString("hex"),
      });
    }
    const { data } = await sb.from("avaliacoes_experiencia").select(COLUNAS).eq("pessoa_id", p.pessoa_id).eq("fim_experiencia", p.fim_experiencia);
    avaliacoes.push(...((data ?? []) as unknown as Linha[]).map(paraAvaliacao));
  }
  return { avaliacoes, semEncarregado };
}

// ---------------------------------------------------------------- e-mails

export interface EmailMontado { assunto: string; html: string }

function quandoTermina(fim: string, hoje: string): string {
  const dias = Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
  if (dias > 1) return `termina em ${dias} dias (${dataBR(fim)})`;
  if (dias === 1) return `termina amanhã (${dataBR(fim)})`;
  if (dias === 0) return `termina hoje (${dataBR(fim)})`;
  return `terminou em ${dataBR(fim)}, há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
}

/** Pedido inicial ao encarregado. */
export function emailPedido(av: Avaliacao, hoje: string): EmailMontado {
  const quando = quandoTermina(av.fim_experiencia, hoje);
  return {
    assunto: `Avaliação de experiência: ${av.pessoa_nome}`,
    html: layoutEmail(
      "Avaliação do período de experiência",
      `<p>Olá${av.encarregado_nome ? `, ${esc(av.encarregado_nome)}` : ""}!</p>
       <p>O período de experiência de <strong>${esc(av.pessoa_nome)}</strong> ${esc(quando)}.</p>
       <p>Precisamos da sua avaliação para decidir o próximo passo. É um formulário curto, de uns 3 minutos, e <strong>a resposta é obrigatória</strong>: você receberá lembretes até enviá-la.</p>`,
      { texto: "Preencher avaliação", url: linkAvaliacao(av.token) }
    ),
  };
}

/** Cobrança: faltam 3 dias, termina hoje ou já passou. */
export function emailCobranca(av: Avaliacao, hoje: string): EmailMontado {
  const quando = quandoTermina(av.fim_experiencia, hoje);
  const atrasada = av.fim_experiencia < hoje;
  return {
    assunto: `${atrasada ? "ATRASADA" : "Pendente"}: avaliação de experiência de ${av.pessoa_nome}`,
    html: layoutEmail(
      atrasada ? "Avaliação de experiência atrasada" : "Avaliação de experiência pendente",
      `<p>Olá${av.encarregado_nome ? `, ${esc(av.encarregado_nome)}` : ""}!</p>
       <p>A avaliação de <strong>${esc(av.pessoa_nome)}</strong> ainda não foi enviada, e o período de experiência ${esc(quando)}.</p>
       <p>Sem ela não conseguimos decidir a tempo. Leva só alguns minutos.</p>`,
      { texto: "Preencher avaliação", url: linkAvaliacao(av.token) }
    ),
  };
}

/** Aviso a Julia Rodrigues e Junior de que uma avaliação chegou. */
export function emailRecebida(av: Avaliacao, linkArea: string): EmailMontado {
  const notas = CRITERIOS.map((c) => `${c.rotulo}: <strong>${av[c.campo] ?? "—"}/5</strong>`).join("<br>");
  return {
    assunto: `Avaliação recebida: ${av.pessoa_nome} (${RECOMENDACOES[av.recomendacao ?? ""] ?? "—"})`,
    html: layoutEmail(
      "Avaliação de experiência recebida",
      `<p><strong>${esc(av.encarregado_nome ?? av.encarregado_email)}</strong> enviou a avaliação de <strong>${esc(av.pessoa_nome)}</strong>
       (experiência até ${dataBR(av.fim_experiencia)}).</p>
       <p>Recomendação: <strong>${esc(RECOMENDACOES[av.recomendacao ?? ""] ?? "—")}</strong></p>
       <p style="line-height:1.7">${notas}</p>
       <p>As respostas completas e o registro da decisão estão na aba Experiência.</p>`,
      { texto: "Abrir Experiência", url: `${linkArea}?aba=exp` }
    ),
  };
}
