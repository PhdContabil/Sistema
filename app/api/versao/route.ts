import { NextResponse } from "next/server";

// Versão publicada (commit do deploy na Vercel) — o VersaoWatcher compara com
// a versão que a aba carregou e atualiza a página quando sai um deploy novo.
export const dynamic = "force-dynamic";

export function GET() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";
  return NextResponse.json({ versao }, { headers: { "Cache-Control": "no-store" } });
}
