import "./globals.css";
import Link from "next/link";
import { APP_VERSION, isAdmin, isDev } from "@/lib/societario/options";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { AutoSync } from "@/components/societario/AutoSync";
import SocietarioShell from "@/components/societario/SocietarioShell";
import AcessoNegado from "@/components/AcessoNegado";
import { obterNivelAcesso, podeAcessarModulo } from "@/lib/acesso";

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

  // Controle de acesso por setor do Núcleo (Paralegal, T.I. e Diretoria),
  // além da própria autorização do Societário (usuarios_autorizados) já
  // checada no middleware. Quem passa no login mas não é do setor liberado
  // vê o aviso em vez do sistema.
  const nivel = await obterNivelAcesso(user.email);
  if (!podeAcessarModulo(nivel, "societario")) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f7fb", padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          <AcessoNegado moduloNome="Societário" />
          <Link href="/" style={{ fontSize: 13, color: "#1f6fa0" }}>← Voltar ao painel</Link>
        </div>
      </div>
    );
  }

  return (
    <SocietarioShell admin={admin} userEmail={user.email ?? ""} roleLabel={roleLabel} versao={APP_VERSION}>
      {children}
      <AutoSync />
    </SocietarioShell>
  );
}
