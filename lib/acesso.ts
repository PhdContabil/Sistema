// Controle de acesso por setor no Núcleo Contábil.
//
// Fonte da verdade: a mesma tabela ticket_users (setor de cada pessoa) já
// usada pra atribuir tickets — em vez de criar uma tabela nova no Supabase,
// reaproveita o cadastro que o time de T.I. já mantém. Só T.I. edita esse
// cadastro (tela em /m/tecnologia/usuarios).
//
// Regra combinada com o Pedro (26/08-01/09/2026):
// - Diretoria (e-mails fixos abaixo): acesso total, todos os módulos.
// - T.I. (setor "ti" em ticket_users, ou admin de Tickets): acesso total.
// - Demais setores: o módulo do próprio setor + Pessoas (Ponto Digital
//   incluso) + Tecnologia e Inovação — mas dentro de Tecnologia só o
//   sistema de Tickets, o resto (Inventário, Catálogo, Base de
//   Conhecimento) é só de T.I.
// - "Paralegal" também enxerga o módulo Societário.
// - "MEI" não tem módulo próprio no Núcleo ainda — fica só no acesso livre
//   (Pessoas + Tickets) até o Pedro decidir onde encaixar.
//
// Ainda só local (não subiu pra prod) — ver instrução do Pedro em 01/09.

import { obterSetorUsuario, ehDaTI, type SetorId } from "@/lib/tickets";

/** Diretoria: acesso total, igual T.I., mas não depende de estar em ticket_users. */
export const DIRETORIA_EMAILS = [
  "edcarlos@phdcontabil.com.br",
  "eduardo@phdcontabil.com.br",
  "junior@phdcontabil.com.br",
];

/** setor (ticket_users.sector) -> módulos do Núcleo liberados, além dos livres. */
const MODULOS_POR_SETOR: Partial<Record<SetorId, string[]>> = {
  fiscal: ["fiscal"],
  trabalhista: ["trabalhista"],
  financeiro: ["financeiro"],
  paralegal: ["paralegal", "societario"],
  contabil: ["contabil"],
  mei: [],
  // "ti" é tratado à parte (acesso total, ver ehDaTI).
};

/** Módulos liberados pra qualquer pessoa autenticada da PHD, independente do setor. */
export const MODULOS_LIVRES = ["pessoas"];

export function ehDiretoria(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && DIRETORIA_EMAILS.includes(e);
}

export interface NivelAcesso {
  email: string;
  /** Diretoria ou T.I. — acesso total, todos os módulos e apps. */
  acessoTotal: boolean;
  diretoria: boolean;
  ti: boolean;
  setor: SetorId | null;
  /** Módulos com acesso total além dos livres (não inclui "tecnologia", tratado à parte). */
  modulosLiberados: string[];
}

const NIVEL_VAZIO: NivelAcesso = {
  email: "",
  acessoTotal: false,
  diretoria: false,
  ti: false,
  setor: null,
  modulosLiberados: [],
};

/** Calcula o nível de acesso da pessoa. Uma chamada de banco (ticket_users), com fallback seguro. */
export async function obterNivelAcesso(email: string | null | undefined): Promise<NivelAcesso> {
  const e = email?.toLowerCase() ?? "";
  if (!e) return NIVEL_VAZIO;

  if (ehDiretoria(e)) {
    return { email: e, acessoTotal: true, diretoria: true, ti: false, setor: null, modulosLiberados: [] };
  }

  const [setor, ti] = await Promise.all([
    obterSetorUsuario(e).catch(() => null),
    ehDaTI(e).catch(() => false),
  ]);

  return {
    email: e,
    acessoTotal: ti,
    diretoria: false,
    ti,
    setor,
    modulosLiberados: setor ? (MODULOS_POR_SETOR[setor] ?? []) : [],
  };
}

/**
 * Acesso ao módulo em si (a tela de listagem de apps do módulo). Para
 * Tecnologia, sempre true — o bloqueio dentro dela é por app, ver
 * `podeAcessarAppTecnologia`.
 */
export function podeAcessarModulo(nivel: NivelAcesso, moduloId: string): boolean {
  if (nivel.acessoTotal) return true;
  if (MODULOS_LIVRES.includes(moduloId)) return true;
  if (moduloId === "tecnologia") return true;
  return nivel.modulosLiberados.includes(moduloId);
}

/** Dentro de Tecnologia e Inovação: só T.I./Diretoria vê tudo, o resto só o sistema de Tickets. */
export function podeAcessarAppTecnologia(nivel: NivelAcesso, href: string | undefined): boolean {
  if (nivel.acessoTotal) return true;
  return !!href && href.startsWith("/m/tecnologia/tickets");
}
