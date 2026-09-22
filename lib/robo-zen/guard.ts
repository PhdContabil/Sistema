// Controle de acesso das rotas de API do Robô Zen — reaproveita a MESMA
// regra de acesso de quem já acessa o módulo "paralegal" hoje (ver
// lib/acesso.ts). Não existe uma permissão nova/granular específica do
// Robô Zen: quem entra em Paralegal, entra no Robô Zen; "enviar de
// verdade" (irreversível) usa a MESMA checagem — a proteção ali é a
// confirmação explícita na tela, não um nível de acesso diferente.

import { NextResponse } from "next/server";
import { getCurrentUser } from "../societario/supabase-server";
import { obterNivelAcesso, podeAcessarModulo } from "../acesso";

export interface UsuarioAutorizado {
  email: string;
}

export async function exigirAcessoParalegal(): Promise<UsuarioAutorizado | NextResponse> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email ?? null;
  const nivel = await obterNivelAcesso(email);
  if (!email || !podeAcessarModulo(nivel, "paralegal")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao módulo Paralegal." }, { status: 403 });
  }
  return { email };
}

export function ehResposta(valor: UsuarioAutorizado | NextResponse): valor is NextResponse {
  return valor instanceof NextResponse;
}
