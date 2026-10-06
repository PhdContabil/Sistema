// "Tick" da varredura agendada do Robô Zen — chamado a cada minuto pelo pg_cron
// do Supabase (ver migration_robo_zen_agendador.sql; não está no vercel.json: o
// plano Hobby só aceita cron de 1x por dia) ou à mão (curl). A lógica, o que ele faz e por que
// é seguro estão em lib/robo-zen/agendador.ts. DESLIGADO por padrão: sem
// ROBO_ZEN_VARREDURA_HORAS > 0 isto devolve "desligado" e não faz mais nada.
//
// Autenticação: igual aos outros crons do Núcleo, com uma diferença de
// propósito — aqui, sem NENHUM segredo configurado a rota RECUSA (401). O
// keepalive deixa passar quando o segredo não existe; este endpoint dispara
// leitura pesada no SharePoint e grava no banco, então "sem segredo" não pode
// virar "aberto pra qualquer um". Vale qualquer um destes dois segredos:
//   - CRON_SECRET (variável de ambiente do projeto — o mesmo dos outros crons)
//   - ROBO_ZEN_VARREDURA_TOKEN (variável de ambiente OU linha em app_config,
//     mínimo de 32 caracteres): token só desta rota, pensado pro agendador do
//     próprio Supabase (pg_cron), que lê o token do banco, então o segredo nunca
//     precisa passar por e-mail, chat ou painel de ninguém.
// E o segredo pode vir em qualquer um destes headers:
//   1. Authorization: Bearer <segredo>   (o formato que o Vercel Cron usa)
//   2. x-cron-secret: <segredo>           (agendador externo / curl)

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { executarTickVarredura } from "@/lib/robo-zen/agendador";
import { lerConfig } from "@/lib/robo-zen/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Chave (env ou app_config) do token próprio desta rota. */
const CONFIG_TOKEN_VARREDURA = "ROBO_ZEN_VARREDURA_TOKEN";

/** Token mais curto que isto é recusado: um "abc" esquecido na tabela não pode virar a chave de entrada. */
const TAMANHO_MINIMO_TOKEN = 32;

/** Segredos que a chamada trouxe (Authorization: Bearer … e/ou x-cron-secret). */
function segredosEnviados(req: NextRequest): string[] {
  const enviados: string[] = [];
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ") && auth.length > "Bearer ".length) enviados.push(auth.slice("Bearer ".length));
  const x = req.headers.get("x-cron-secret");
  if (x) enviados.push(x);
  return enviados;
}

async function autorizado(req: NextRequest): Promise<boolean> {
  // Sem nenhum segredo na chamada: recusa já, sem tocar em banco nenhum.
  const enviados = segredosEnviados(req);
  if (enviados.length === 0) return false;

  const doAmbiente = process.env.CRON_SECRET;
  if (doAmbiente && enviados.some((e) => iguais(e, doAmbiente))) return true;

  const token = await lerConfig(CONFIG_TOKEN_VARREDURA);
  return !!token && token.length >= TAMANHO_MINIMO_TOKEN && enviados.some((e) => iguais(e, token));
}

async function tick(req: NextRequest) {
  if (!(await autorizado(req))) {
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
