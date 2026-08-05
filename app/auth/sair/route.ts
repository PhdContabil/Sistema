import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const resposta = NextResponse.redirect(`${url.origin}/login`);
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
  await sb.auth.signOut();
  return resposta;
}
