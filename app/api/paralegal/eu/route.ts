import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

// Usuário logado — só o nome (derivado do e-mail), pra autopreencher
// "Usuário"/"Tratado com" na criação de OS, igual ao Paralegal System antigo
// (pega a parte antes do @ e capitaliza).
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }
  const email = user?.email ?? "";
  const prefixo = email.split("@")[0] ?? "";
  const nome = prefixo
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return NextResponse.json({ email, nome });
}
