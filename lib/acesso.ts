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
// - Societário virou um submódulo de Paralegal (deixou de ser módulo à
//   parte) — quem tem Paralegal, tem Societário.
// - "MEI" não tem módulo próprio no Núcleo ainda — fica só no acesso livre
//   (Pessoas + Tickets) até o Pedro decidir onde encaixar.
//
// Ainda só local (não subiu pra prod) — ver instrução do Pedro em 01/09.

import { obterSetorUsuario, ehDaTI, listarPermissoesPessoa, type SetorId, type NivelPermissao } from "@/lib/tickets";
import { getModule } from "@/lib/modules";

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
  paralegal: ["paralegal"],
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
  /** Overrides individuais definidos em /m/tecnologia/usuarios (T.I./Diretoria). */
  overridesModulos: Record<string, NivelPermissao>;
  overridesApps: Record<string, Record<string, NivelPermissao>>;
}

const NIVEL_VAZIO: NivelAcesso = {
  email: "",
  acessoTotal: false,
  diretoria: false,
  ti: false,
  setor: null,
  modulosLiberados: [],
  overridesModulos: {},
  overridesApps: {},
};

/** Calcula o nível de acesso da pessoa. Chamadas de banco (ticket_users + overrides), com fallback seguro. */
export async function obterNivelAcesso(email: string | null | undefined): Promise<NivelAcesso> {
  const e = email?.toLowerCase() ?? "";
  if (!e) return NIVEL_VAZIO;

  const overrides = await listarPermissoesPessoa(e).catch(() => ({ modulos: {}, apps: {} }));

  if (ehDiretoria(e)) {
    return {
      email: e, acessoTotal: true, diretoria: true, ti: false, setor: null, modulosLiberados: [],
      overridesModulos: overrides.modulos, overridesApps: overrides.apps,
    };
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
    overridesModulos: overrides.modulos,
    overridesApps: overrides.apps,
  };
}

/** Acesso ao módulo pela regra padrão (setor/T.I./Diretoria), sem considerar overrides individuais. */
function moduloLiberadoPeloSetor(nivel: NivelAcesso, moduloId: string): boolean {
  if (nivel.acessoTotal) return true;
  if (MODULOS_LIVRES.includes(moduloId)) return true;
  if (moduloId === "tecnologia") return true;
  return nivel.modulosLiberados.includes(moduloId);
}

/**
 * Acesso ao módulo em si (a tela de listagem de apps do módulo). Para
 * Tecnologia, sempre true — o bloqueio dentro dela é por app, ver
 * `podeAcessarAppTecnologia`. Um override individual (liberar/bloquear
 * definido em /m/tecnologia/usuarios) sempre vence a regra padrão do setor.
 *
 * Liberar só um submódulo específico (sem liberar o módulo inteiro) também
 * dá acesso à tela do módulo — só esse submódulo aparece habilitado dentro
 * dela, ver `podeAcessarApp`.
 */
export function podeAcessarModulo(nivel: NivelAcesso, moduloId: string): boolean {
  const override = nivel.overridesModulos[moduloId];
  if (override === "bloqueado") return false;
  if (override === "liberado") return true;
  if (moduloLiberadoPeloSetor(nivel, moduloId)) return true;
  const apps = nivel.overridesApps[moduloId];
  return !!apps && Object.values(apps).includes("liberado");
}

/** Encontra o nome do app (chave usada nos overrides) a partir do href, dentro de um módulo. */
function nomeAppPorHref(moduloId: string, href: string): string | undefined {
  return getModule(moduloId)?.apps.find((a) => a.href === href)?.name;
}

/** Dentro de Tecnologia e Inovação: só T.I./Diretoria vê tudo, o resto só o sistema de Tickets — exceto override individual. */
export function podeAcessarAppTecnologia(nivel: NivelAcesso, href: string | undefined): boolean {
  const appNome = href ? nomeAppPorHref("tecnologia", href) : undefined;
  const override = appNome ? nivel.overridesApps["tecnologia"]?.[appNome] : undefined;
  if (override === "bloqueado") return false;
  if (override === "liberado") return true;
  if (nivel.acessoTotal) return true;
  return !!href && href.startsWith("/m/tecnologia/tickets");
}

/**
 * Acesso a um app/submódulo específico (fora de Tecnologia, que tem sua
 * própria regra acima). Um override no próprio app sempre vence; sem
 * override de app, segue o override do módulo (se houver) ou a regra padrão
 * do setor — ou seja, liberar só um submódulo NÃO libera os outros: eles
 * continuam seguindo a regra normal do módulo.
 */
export function podeAcessarApp(nivel: NivelAcesso, moduloId: string, appNome: string): boolean {
  const overrideApp = nivel.overridesApps[moduloId]?.[appNome];
  if (overrideApp === "bloqueado") return false;
  if (overrideApp === "liberado") return true;

  const overrideModulo = nivel.overridesModulos[moduloId];
  if (overrideModulo === "bloqueado") return false;
  if (overrideModulo === "liberado") return true;

  return moduloLiberadoPeloSetor(nivel, moduloId);
}
