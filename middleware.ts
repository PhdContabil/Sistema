// Middleware do hub Núcleo Contábil.
// Por enquanto só protege o módulo Societário (/m/societario/** e
// /api/societario/**), migrado do app standalone societario-phd.
// Os demais módulos (Fiscal, Financeiro etc.) continuam sem login.
//
// - Redireciona para /m/societario/login se não autenticado.
// - Bloqueia se email não estiver autorizado (DB + fallback hardcoded).
// - Bloqueia /m/societario/admin e /m/societario/tipos-processo para
//   usuários sem permissão de admin.
// - Bloqueia /m/societario/processos/novo e
//   /m/societario/processos/[id]/editar para colaboradores.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed, isAdmin } from "@/lib/societario/options";

const PUBLIC_PATHS = [
  // Login do hub
  "/login",
  "/auth/callback",
  "/auth/sair",
  // Login/rotas de auth do módulo Societário
  "/m/societario/login",
  "/m/societario/auth/callback",
  "/m/societario/auth/error",
  "/m/societario/auth/debug",
  // Tarefas agendadas (executadas pela Vercel, sem sessão de usuário)
  "/api/societario/cron",
];

/** Domínio corporativo autorizado a entrar no hub. */
const DOMINIO_PHD = "@phdcontabil.com.br";

/** Rotas do módulo Societário (mantêm a lista de autorizados própria). */
function isSocietarioPath(path: string): boolean {
  return path.startsWith("/m/societario") || path.startsWith("/api/societario");
}

// Timeout curto para qualquer chamada externa dentro do middleware.
// O Edge Middleware da Vercel tem um limite de execução de ~25s; sem isso,
// uma instância do Supabase pausada/lenta trava o middleware até estourar
// esse limite e a Vercel devolve 504 MIDDLEWARE_INVOCATION_TIMEOUT.
const EXTERNAL_CALL_TIMEOUT_MS = 5000;

async function isEmailAllowedDB(email: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/usuarios_autorizados?select=id,active&email=eq.${encodeURIComponent(
        email.toLowerCase()
      )}&limit=1`,
      {
        headers: {
          apikey: svc,
          Authorization: `Bearer ${svc}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
      }
    );
    if (!r.ok) return false;
    const rows = (await r.json()) as Array<{ id: number; active: boolean }>;
    return !!(rows[0] && rows[0].active);
  } catch {
    return false;
  }
}

/** Chama supabase.auth.getUser() com timeout, pra não travar o middleware
 * caso o Supabase Auth esteja pausado/lento (plano Free pausa após inatividade). */
async function getUserWithTimeout(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ user: { email?: string | null } | null }> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("getUser timeout")),
          EXTERNAL_CALL_TIMEOUT_MS
        )
      ),
    ]);
    return { user: result.data.user };
  } catch {
    return { user: null };
  }
}

/** Rotas que SÓ admin/dev pode acessar (dentro do módulo societário). */
function isAdminOnlyPath(path: string): boolean {
  if (path.startsWith("/m/societario/admin")) return true;
  if (path.startsWith("/api/societario/admin")) return true;
  if (path.startsWith("/m/societario/tipos-processo")) return true;
  // Mexer em processos: criar / editar / excluir.
  if (path.startsWith("/m/societario/processos/novo")) return true;
  if (/^\/m\/societario\/processos\/[^/]+\/editar/.test(path)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // Padrão oficial do @supabase/ssr: os cookies renovados precisam ser
  // repassados TANTO para a request quanto para a response. Sem isso, a
  // sessão se perde a cada renovação de token e o usuário cai no login.
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /** Redireciona preservando os cookies de sessão renovados. */
  const redirecionar = (url: URL) => {
    const r = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const { user } = await getUserWithTimeout(supabase);

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (isPublic) return res;

  // ===== 1. Sem sessão: manda para o login do hub =====
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return redirecionar(url);
  }

  const email = user.email || "";

  // ===== 2. Só e-mails da PHD =====
  if (!email.toLowerCase().endsWith(DOMINIO_PHD)) {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((r) => setTimeout(r, EXTERNAL_CALL_TIMEOUT_MS)),
      ]);
    } catch { /* o redirect abaixo já bloqueia */ }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("erro", "dominio");
    url.searchParams.set("email", email);
    return redirecionar(url);
  }

  // ===== 3. Fora do Societário, qualquer pessoa da PHD entra =====
  if (!isSocietarioPath(path)) {
    if (path === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return redirecionar(url);
    }
    return res;
  }

  // ===== 4. Societário: mantém a lista de autorizados =====
  let allowed = isEmailAllowed(email) || isAdmin(email);
  if (!allowed) {
    allowed = await isEmailAllowedDB(email);
  }

  if (!allowed) {
    if (path === "/m/societario/auth/error") return res;
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) =>
          setTimeout(resolve, EXTERNAL_CALL_TIMEOUT_MS)
        ),
      ]);
    } catch {
      // ignora falha/timeout no signOut — o redirect abaixo já bloqueia o acesso.
    }
    const url = req.nextUrl.clone();
    url.pathname = "/m/societario/auth/error";
    url.searchParams.set("reason", "not_allowed");
    url.searchParams.set("email", email);
    return redirecionar(url);
  }

  // Restringe áreas admin / cadastros / mutações para quem não é admin.
  if (isAdminOnlyPath(path)) {
    if (!isAdmin(email)) {
      const url = req.nextUrl.clone();
      url.pathname = "/m/societario/auth/error";
      url.searchParams.set("reason", "not_admin");
      return redirecionar(url);
    }
  }

  if (path === "/m/societario/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/m/societario";
    return redirecionar(url);
  }

  return res;
}

export const config = {
  // Protege o sistema inteiro, exceto assets estáticos e arquivos públicos.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|societario/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|txt|xml)$).*)",
  ],
};
