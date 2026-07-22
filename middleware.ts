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

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed, isAdmin } from "@/lib/societario/options";

const PUBLIC_PATHS = [
  "/m/societario/login",
  "/m/societario/auth/callback",
  "/m/societario/auth/error",
  "/m/societario/auth/debug",
];

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
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { user } = await getUserWithTimeout(supabase);

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user) {
    if (isPublic) return res;
    const url = req.nextUrl.clone();
    url.pathname = "/m/societario/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const email = user.email || "";
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
    return NextResponse.redirect(url);
  }

  // Restringe áreas admin / cadastros / mutações para quem não é admin.
  if (isAdminOnlyPath(path)) {
    if (!isAdmin(email)) {
      const url = req.nextUrl.clone();
      url.pathname = "/m/societario/auth/error";
      url.searchParams.set("reason", "not_admin");
      return NextResponse.redirect(url);
    }
  }

  if (path === "/m/societario/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/m/societario";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/m/societario/:path*", "/api/societario/:path*"],
};
