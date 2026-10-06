// "Tick" da varredura agendada do Robô Zen — chamado por um agendador externo a
// cada poucos minutos (não está no vercel.json: o plano Hobby só aceita cron de
// 1x por dia) ou à mão (curl). A lógica, o que ele faz e por que
// é seguro estão em lib/robo-zen/agendador.ts. DESLIGADO por padrão: sem
// ROBO_ZEN_VARREDURA_HORAS > 0 isto devolve "desligado" e não faz mais nada.
//
// Autenticação: igual aos outros crons do Núcleo, com uma diferença de
// propósito — aqui, SEM `CRON_SECRET` configurado a rota RECUSA (401). O
// keepalive deixa passar quando o segredo não existe; este endpoint dispara
// leitura pesada no SharePoint e grava no banco, então "sem segredo" não pode
// virar "aberto pra qualquer um".
//   1. Header Authorization: Bearer <CRON_SECRET>  (o formato que o Vercel Cron usa)
//   2. Header x-cron-secret: <CRON_SECRET>          (agendador externo / curl)

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { executarTickVarredura } from "@/lib/robo-zen/agendador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const bearer = req.headers.get("authorization");
  if (bearer && iguais(bearer, `Bearer ${segredo}`)) return true;
  const x = req.headers.get("x-cron-secret");
  return !!x && iguais(x, segredo);
}

async function tick(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "Unauthorized" }, { status: 401 });
  }
  try {
    const resultado = await executarTickVarredura();
    // Só registra no log quando aconteceu algo — o agendador bate o tempo todo e
    // "desligado"/"nada a fazer" encheria o log da Vercel de ruído.
    if (resultado.acao === "iniciou" || resultado.acao === "avancou") {
      console.log(
        `[robo-zen/varredura] ${resultado.acao}: simulação ${resultado.simulacaoId}, ${resultado.passos} passo(s), ` +
          `${resultado.estado?.empresasProcessadas ?? 0}/${resultado.estado?.totalEmpresas ?? 0} empresas, status ${resultado.estado?.status}`
      );
    }
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[robo-zen/varredura] falhou: ${mensagem}`);
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}

export const GET = tick;
export const POST = tick;
