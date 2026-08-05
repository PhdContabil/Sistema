// Callback do login do hub: troca o code por sessão e valida o domínio do e-mail.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const DOMINIO = "@phdcontabil.com.br";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (url.searchParams.get("error") || !code) {
    return NextResponse.redirect(`${url.origin}/login?erro=oauth`);
  }

  const resposta = NextResponse.redirect(`${url.origin}${next}`);
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          resposta.cookies.set({ name, value, ...options }),
        remove: (name: string, options: CookieOptions) =>
          resposta.cookies.set({ name, value: "", ...options }),
      },
    }
  );

  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${url.origin}/login?erro=oauth`);
  }

  // Só e-mails do domínio da PHD
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith(DOMINIO)) {
    await sb.auth.signOut();
    const fora = new URL(`${url.origin}/login`);
    fora.searchParams.set("erro", "dominio");
    if (email) fora.searchParams.set("email", email);
    return NextResponse.redirect(fora);
  }

  return resposta;
}
