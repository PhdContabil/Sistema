import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sendDeployNotification } from "@/lib/teams";

// Recebe o webhook de deploy da Vercel (configurado no dashboard da Vercel:
// Project/Team Settings -> Webhooks, eventos "deployment.succeeded" e
// "deployment.error") e manda um aviso no canal de T.I. do Teams — mesmo
// webhook já usado pelos tickets (TEAMS_WEBHOOK_TI, ver lib/teams.ts).
//
// Assinatura verificada com VERCEL_WEBHOOK_SECRET, gerado pela própria
// Vercel ao criar o webhook (Settings -> Webhooks -> Create). Sem esse
// segredo configurado, o endpoint aceita a requisição sem validar (só pra
// não travar em ambiente local, onde a Vercel nunca chama esse endpoint).

export const dynamic = "force-dynamic";

function assinaturaValida(raw: string, assinatura: string | null, segredo: string): boolean {
  if (!assinatura) return false;
  const esperado = crypto.createHmac("sha1", segredo).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  } catch {
    return false;
  }
}

interface VercelWebhookPayload {
  type?: string;
  payload?: {
    name?: string;
    url?: string;
    target?: string | null;
    project?: { name?: string };
    deployment?: {
      url?: string;
      target?: string | null;
      meta?: Record<string, string>;
    };
  };
}

export async function POST(req: Request) {
  const segredo = process.env.VERCEL_WEBHOOK_SECRET;
  const raw = await req.text();

  if (segredo) {
    const assinatura = req.headers.get("x-vercel-signature");
    if (!assinaturaValida(raw, assinatura, segredo)) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }
  }

  let evento: VercelWebhookPayload;
  try {
    evento = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const tipo = evento.type ?? "";
  if (tipo !== "deployment.succeeded" && tipo !== "deployment.error") {
    return NextResponse.json({ ok: true, ignorado: tipo });
  }

  const p = evento.payload ?? {};
  const deployment = p.deployment ?? {};
  const meta = deployment.meta ?? {};
  const target = p.target ?? deployment.target;

  // só produção — evita alerta a cada preview de PR/branch
  if (target && target !== "production") {
    return NextResponse.json({ ok: true, ignorado: "preview" });
  }

  const urlDeploy = deployment.url ?? p.url;
  const url = urlDeploy ? `https://${urlDeploy}` : "https://vercel.com";

  const resultado = await sendDeployNotification({
    ok: tipo === "deployment.succeeded",
    projectName: p.project?.name ?? p.name ?? "Núcleo Contábil",
    commitMessage: meta.githubCommitMessage,
    commitAuthor: meta.githubCommitAuthorName,
    commitSha: meta.githubCommitSha,
    branch: meta.githubCommitRef,
    url,
  });

  return NextResponse.json(resultado);
}
