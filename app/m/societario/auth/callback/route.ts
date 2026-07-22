// Callback do OAuth: troca o `code` por uma sessão e redireciona.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/m/societario";
  const errorParam = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  // Se o próprio Azure/Supabase mandou erro
  if (errorParam) {
    const errUrl = new URL(`${url.origin}/m/societario/auth/error`);
    errUrl.searchParams.set("reason", "oauth_error");
    errUrl.searchParams.set("detail", `${errorParam}: ${errorDesc || ""}`);
    return NextResponse.redirect(errUrl);
  }

  if (!code) {
    const errUrl = new URL(`${url.origin}/m/societario/auth/error`);
    errUrl.searchParams.set("reason", "no_code");
    return NextResponse.redirect(errUrl);
  }

  const response = NextResponse.redirect(`${url.origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errUrl = new URL(`${url.origin}/m/societario/auth/error`);
    errUrl.searchParams.set("reason", "exchange_failed");
    errUrl.searchParams.set("detail", error.message);
    return NextResponse.redirect(errUrl);
  }

  return response;
}
