// Página de debug — mostra estado da sessão atual.
// Acesse /m/societario/auth/debug logado para ver as informações.
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/societario/supabase-server";
import { ALLOWED_EMAILS, isEmailAllowed } from "@/lib/societario/options";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const sb = createSupabaseServerClient();
  const { data: userData } = await sb.auth.getUser();
  const { data: sessionData } = await sb.auth.getSession();
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  const authCookies = allCookies.filter((c) => c.name.includes("sb-"));

  const user = userData?.user;
  const session = sessionData?.session;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold">Debug de autenticação</h1>

        <section>
          <h2 className="font-semibold mb-2">Sessão</h2>
          <div className="bg-gray-100 rounded p-3 text-sm font-mono">
            {session ? (
              <>
                <div>✓ Sessão ativa</div>
                <div>access_token: {session.access_token.slice(0, 20)}...</div>
                <div>expires_at: {new Date((session.expires_at || 0) * 1000).toLocaleString()}</div>
              </>
            ) : (
              <div className="text-red-600">✗ Sem sessão</div>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Usuário</h2>
          <div className="bg-gray-100 rounded p-3 text-sm font-mono">
            {user ? (
              <>
                <div>id: {user.id}</div>
                <div>email: {user.email || "(vazio)"}</div>
                <div>provider: {user.app_metadata?.provider}</div>
                <div className="mt-2">user_metadata:</div>
                <pre className="text-xs">
                  {JSON.stringify(user.user_metadata, null, 2)}
                </pre>
              </>
            ) : (
              <div className="text-red-600">✗ Sem usuário</div>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Allowlist</h2>
          <div className="bg-gray-100 rounded p-3 text-sm font-mono">
            <div>Emails permitidos:</div>
            <ul className="list-disc pl-5">
              {ALLOWED_EMAILS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <div className="mt-2">
              Seu email está na allowlist?{" "}
              <span className={isEmailAllowed(user?.email) ? "text-green-600" : "text-red-600"}>
                {isEmailAllowed(user?.email) ? "SIM ✓" : "NÃO ✗"}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Cookies de auth</h2>
          <div className="bg-gray-100 rounded p-3 text-xs font-mono">
            {authCookies.length === 0 ? (
              <div className="text-red-600">✗ Nenhum cookie sb-* encontrado</div>
            ) : (
              authCookies.map((c) => (
                <div key={c.name}>
                  {c.name}: {c.value.slice(0, 40)}...
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
