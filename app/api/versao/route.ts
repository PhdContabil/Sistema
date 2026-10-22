import { NextResponse } from "next/server";

// Versão publicada (commit do deploy na Vercel) — o VersaoWatcher compara com
// a versão que a aba carregou e atualiza a página quando sai um deploy novo.
// Estática: gerada no build de cada deploy e servida pelo CDN — não executa função
// (antes eram ~1.000 invocações a cada 6 h só deste polling).
export const dynamic = "force-static";

export function GET() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";
  return NextResponse.json({ versao }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
}
