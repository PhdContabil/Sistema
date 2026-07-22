// Aba "Administração → Usuários".
// O middleware bloqueia acesso de quem não for admin.

import { listUsuarios } from "@/lib/societario/usuarios";
import { ADMIN_EMAILS } from "@/lib/societario/options";
import { UsuariosClient } from "./UsuariosClient";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const usuarios = await listUsuarios();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Usuários autorizados</h1>
        <p className="text-sm text-gray-500">
          Gerencie quem pode acessar o sistema · {usuarios.filter((u) => u.active).length} ativos de {usuarios.length}
        </p>
      </header>

      <UsuariosClient
        usuariosIniciais={usuarios}
        adminEmails={ADMIN_EMAILS.map((e) => e.toLowerCase())}
      />
    </div>
  );
}
