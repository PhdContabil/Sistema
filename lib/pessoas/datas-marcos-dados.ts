// Datas e Marcos — leitura do banco e permissões. SERVIDOR.
//
// As tabelas novas (pessoas_datas, pessoas_formaturas, datas_comemorativas,
// lembretes_*) não têm acesso para anon/authenticated: só o service role lê.
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { admin, ehApoioGestaoPessoas } from "./ferias";
import type { ContextoDatas, DataComemorativa, Formatura, PessoaDatas } from "./datas-marcos";

export interface QuemEstaAqui {
  email: string;
  /** Vê as abas de RH: Experiência, Datas e campanhas e Lembretes. */
  rh: boolean;
  /** Lembrancinhas, avaliações e histórico de experiência (dado sensível): Julia Rodrigues, Junior e T.I. */
  controle: boolean;
}

/** Quem cuida das lembrancinhas (fazer e entregar). */
export const RESPONSAVEIS_CONTROLE = ["julia.rodrigues@phdcontabil.com.br", "junior@phdcontabil.com.br"];

/**
 * Quem é do RH nesta área: Diretoria e T.I. (acesso total), encarregados
 * (marca no cadastro) e quem apoia a gestão de pessoas (Julia Rodrigues).
 */
export async function quemEstaAqui(): Promise<QuemEstaAqui> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? "";
  if (!email) return { email: "", rh: false, controle: false };
  const nivel = await obterNivelAcesso(email).catch(() => null);
  // Julia Rodrigues e Junior cuidam do controle; a T.I. tem acesso a tudo.
  const controle = RESPONSAVEIS_CONTROLE.includes(email) || Boolean(nivel?.ti);
  if (ehApoioGestaoPessoas(email)) return { email, rh: true, controle };
  if (nivel?.acessoTotal) return { email, rh: true, controle };

  const sb = admin();
  if (!sb) return { email, rh: false, controle };
  const { data } = await sb.from("pessoas_perfil").select("encarregado").ilike("email", email).maybeSingle();
  return { email, rh: Boolean(data?.encarregado), controle };
}

interface LinhaPessoa {
  pessoa_id: number;
  data_nascimento: string | null;
  data_admissao: string | null;
  fim_experiencia: string | null;
  admissao_origem: string;
  pessoas_perfil: { nome: string; ativo: boolean } | { nome: string; ativo: boolean }[] | null;
}

export async function carregarPessoasDatas(): Promise<PessoaDatas[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb
    .from("pessoas_datas")
    .select("pessoa_id,data_nascimento,data_admissao,fim_experiencia,admissao_origem,pessoas_perfil(nome,ativo)");
  return ((data ?? []) as unknown as LinhaPessoa[]).map((l) => {
    const perfil = Array.isArray(l.pessoas_perfil) ? l.pessoas_perfil[0] : l.pessoas_perfil;
    return {
      pessoa_id: l.pessoa_id,
      nome: perfil?.nome ?? "—",
      ativo: Boolean(perfil?.ativo),
      data_nascimento: l.data_nascimento,
      data_admissao: l.data_admissao,
      fim_experiencia: l.fim_experiencia,
    };
  });
}

export async function carregarDatasComemorativas(incluirInativas = false): Promise<(DataComemorativa & { ativo: boolean })[]> {
  const sb = admin();
  if (!sb) return [];
  let q = sb.from("datas_comemorativas").select("id,titulo,tipo,regra,mes,dia,data_unica,cor,ativo").order("mes").order("dia");
  if (!incluirInativas) q = q.eq("ativo", true);
  const { data } = await q;
  return (data ?? []) as (DataComemorativa & { ativo: boolean })[];
}

interface LinhaFormatura {
  id: number; pessoa_id: number; curso: string; nivel: string; previsao: string;
  pessoas_perfil: { nome: string } | { nome: string }[] | null;
}

export async function carregarFormaturas(): Promise<Formatura[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb.from("pessoas_formaturas").select("id,pessoa_id,curso,nivel,previsao,pessoas_perfil(nome)").order("previsao");
  return ((data ?? []) as unknown as LinhaFormatura[]).map((l) => {
    const perfil = Array.isArray(l.pessoas_perfil) ? l.pessoas_perfil[0] : l.pessoas_perfil;
    return { id: l.id, pessoa_id: l.pessoa_id, nome: perfil?.nome ?? "—", curso: l.curso, nivel: l.nivel, previsao: l.previsao };
  });
}

/** Colaboradores ativos, para escolher na hora de cadastrar uma formatura. */
export async function carregarPessoasAtivas(): Promise<{ id: number; nome: string }[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb.from("pessoas_perfil").select("id,nome").eq("ativo", true).order("nome");
  return (data ?? []) as { id: number; nome: string }[];
}

/** Tudo o que a agenda precisa para gerar os eventos de um mês. */
export async function carregarContexto(opts: { incluirExperiencia?: boolean } = {}): Promise<ContextoDatas> {
  const [pessoas, datas, formaturas] = await Promise.all([
    carregarPessoasDatas(), carregarDatasComemorativas(), carregarFormaturas(),
  ]);
  return { pessoas, datas, formaturas, incluirExperiencia: opts.incluirExperiencia };
}

export interface LembreteConfig {
  chave: string;
  titulo: string;
  descricao: string | null;
  ativo: boolean;
  antecedencia_dias: number;
  destinatarios: string[];
}

export async function carregarLembretes(): Promise<LembreteConfig[]> {
  const sb = admin();
  if (!sb) return [];
  const { data } = await sb.from("lembretes_config")
    .select("chave,titulo,descricao,ativo,antecedencia_dias,destinatarios").order("chave");
  const ordem = ["resumo_mes", "tempo_casa", "experiencia"];
  return ((data ?? []) as LembreteConfig[]).sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
}

export interface Lembrancinha {
  pessoa_id: number; anos: number;
  feita_em: string | null; feita_por: string | null;
  entregue_em: string | null; entregue_por: string | null;
}

/** Controle das lembrancinhas, por "pessoa-anos". */
export async function carregarLembrancinhas(): Promise<Map<string, Lembrancinha>> {
  const m = new Map<string, Lembrancinha>();
  const sb = admin();
  if (!sb) return m;
  const { data } = await sb.from("pessoas_lembrancinhas").select("pessoa_id,anos,feita_em,feita_por,entregue_em,entregue_por");
  for (const l of (data ?? []) as Lembrancinha[]) m.set(`${l.pessoa_id}-${l.anos}`, l);
  return m;
}
