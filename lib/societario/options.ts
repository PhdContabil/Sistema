// Opções padronizadas do sistema.
// Os tipos de processo dinâmicos ficam em src/lib/tiposProcesso.ts.

export const APP_VERSION = "1.5.0";

// ---------- Papéis (roles) ----------
// 3 níveis de permissão:
//   - dev:   acesso total, gerencia tudo (somente o time de tecnologia)
//   - admin: cria/edita/exclui processos, cadastra usuários
//   - user:  colaborador — visualiza dados mas não consegue criar/editar
//            processos, não vê aba Administração nem Tipos de Processo
export type UserRole = "dev" | "admin" | "user";

// Listas hardcoded — usadas APENAS como salvaguarda contra "lock out".
// A source of truth para usuários e seus papéis é a tabela usuarios_autorizados
// (gerenciada pela aba /m/societario/admin/usuarios).
export const DEV_EMAILS: string[] = [
  "tecnologia@phdcontabil.com.br",
];

export const ADMIN_EMAILS_HARDCODED: string[] = [
  "tecnologia@phdcontabil.com.br",
  "flavia@phdcontabil.com.br",
  "rhafael@phdcontabil.com.br",
];

// Fallback de allowlist: garante que o dev sempre entra mesmo que o DB falhe.
export const ALLOWED_EMAILS: string[] = [...DEV_EMAILS];

// Mantido por retrocompat com middleware antigo — qualquer um na ADMIN_EMAILS
// vai liberar como admin.
export const ADMIN_EMAILS: string[] = ADMIN_EMAILS_HARDCODED;

function lower(s: string | null | undefined): string {
  return (s || "").toLowerCase();
}

function inList(list: string[], email: string | null | undefined): boolean {
  const e = lower(email);
  if (!e) return false;
  return list.some((x) => x.toLowerCase() === e);
}

// ---------- Helpers de permissão ----------

export function isDev(email: string | null | undefined): boolean {
  return inList(DEV_EMAILS, email);
}

/** Admin inclui dev (dev pode tudo que admin pode). */
export function isAdmin(email: string | null | undefined): boolean {
  if (isDev(email)) return true;
  return inList(ADMIN_EMAILS_HARDCODED, email);
}

/** Email está na allowlist hardcoded (fallback de segurança). */
export function isEmailAllowed(email: string | null | undefined): boolean {
  return inList(ALLOWED_EMAILS, email);
}

/** Pode criar/editar/excluir processos e cadastrar usuários. */
export function canManageProcessos(
  email: string | null | undefined
): boolean {
  return isAdmin(email);
}

export function canManageUsers(email: string | null | undefined): boolean {
  return isAdmin(email);
}

/** Pode ver/gerenciar tipos de processo. */
export function canManageTipos(email: string | null | undefined): boolean {
  return isAdmin(email);
}

// ---------- Responsáveis oficiais ----------
// Apenas os listados aqui aparecem nos filtros e rankings.
export const RESPONSAVEIS = [
  "SARA",
  "RHAFAEL SANTOS",
  "FLAVIA CAVALCANTE",
  "JULIA HELENA",
  "RAFAEL NUNES",
  "STANDBY",
] as const;

export type Responsavel = (typeof RESPONSAVEIS)[number];

export function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

export function canonicalResponsavel(
  s: string | null | undefined
): Responsavel | null {
  if (!s) return null;
  const n = normName(s);
  for (const r of RESPONSAVEIS) {
    if (normName(r) === n) return r;
  }
  if (n.includes("STANDBY")) return "STANDBY";
  return null;
}

// ---------- Status ----------
export const STATUS_PROCESSO = [
  "ACOMPANHAMENTO",
  "AGUARDANDO CLIENTE",
  "AGUARDANDO CONCLUSÃO",
  "ALTA PRIORIDADE",
  "MÉDIA PRIORIDADE",
  "BAIXA PRIORIDADE",
  "EM TRATATIVAS",
  "PARADO/SUSPENSO",
  "CONCLUÍDO",
  "CANCELADO",
] as const;

export function statusClass(status: string | null | undefined): string {
  if (!status) return "status-default";
  const s = status.toUpperCase();
  if (s.includes("CONCL")) return "status-concluido";
  if (s.includes("CANCEL")) return "status-cancelado";
  if (s.includes("ALTA")) return "status-alta";
  if (s.includes("MÉDIA") || s.includes("MEDIA")) return "status-media";
  if (s.includes("BAIXA")) return "status-baixa";
  if (s.includes("AGUARD") || s.includes("PEND") || s.includes("PARAD"))
    return "status-pendente";
  return "status-andamento";
}

// ---------- Tipos de processo padrão ----------
export const TIPOS_PROCESSO_DEFAULT: { name: string; active: boolean }[] = [
  { name: "Abertura de Empresa", active: true },
  { name: "Abertura - Parte 1", active: true },
  { name: "Abertura - Parte 2", active: true },
  { name: "Alteração contratual", active: true },
  { name: "Alteração - QSA", active: true },
  { name: "Cancelamento", active: true },
  { name: "Cancelamento de CCM", active: true },
  { name: "Constituição", active: true },
  { name: "Desenquadramento de MEI", active: true },
  { name: "Emissão de CLI", active: true },
  { name: "IBGE", active: true },
  { name: "INTEGRAÇÃO - TROCA DE CONTADOR", active: true },
  { name: "Registro de Ata", active: true },
  { name: "SERVIÇOS AVULSOS", active: true },
];
