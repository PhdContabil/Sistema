import Link from "next/link";
import "./globals.css";
import { isAdmin, isDev } from "@/lib/societario/options";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { AutoSync } from "@/components/societario/AutoSync";

export const metadata = {
  title: "Societário | PhD Contábil",
  description: "Sistema societário — PhD Contábil",
};

export default async function SocietarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const admin = isAdmin(user?.email);
  const dev = isDev(user?.email);
  const roleLabel = dev ? "Desenvolvedor" : admin ? "Administrador" : "Colaborador";

  if (!user) {
    // Páginas públicas do módulo (login, callback, erro) — sem sidebar.
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen societario-scope">
      <aside className="fixed top-0 left-0 h-screen w-52 bg-brand-900 text-white flex flex-col z-10">
        <div className="px-4 py-5 border-b border-white/10 text-center">
          <div className="text-lg font-bold tracking-tight">Societário</div>
          <div className="text-[10px] text-white/60">PhD Contábil</div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 text-sm overflow-y-auto">
          <NavLink href="/m/societario">Dashboard</NavLink>
          <NavLink href="/m/societario/processos">Processos</NavLink>
          {admin && (
            <NavLink href="/m/societario/processos/novo">+ Novo processo</NavLink>
          )}
          <NavLink href="/m/societario/empresas">Empresas</NavLink>
          {admin && (
            <>
              <div className="px-2 pt-3 pb-1 text-[9px] text-white/40 uppercase tracking-wider">
                Cadastros
              </div>
              <NavLink href="/m/societario/tipos-processo">Tipos de processo</NavLink>
              <div className="px-2 pt-3 pb-1 text-[9px] text-white/40 uppercase tracking-wider">
                Administração
              </div>
              <NavLink href="/m/societario/admin/usuarios">Usuários</NavLink>
            </>
          )}
          <div className="px-2 pt-3 pb-1 text-[9px] text-white/40 uppercase tracking-wider">
            Núcleo Contábil
          </div>
          <NavLink href="/">← Voltar ao painel</NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <div className="text-[10px] text-white/50 truncate">{user.email}</div>
          <div className="text-[9px] text-white/40 mb-1">{roleLabel}</div>
          <form action="/m/societario/auth/signout" method="post">
            <button
              type="submit"
              className="text-[11px] text-white/70 hover:text-white underline-offset-2 hover:underline"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="ml-52 px-8 py-6 overflow-x-auto min-h-screen">
        {children}
      </main>
      <AutoSync />
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-2.5 py-1.5 rounded text-[13px] hover:bg-white/10 transition"
    >
      {children}
    </Link>
  );
}
