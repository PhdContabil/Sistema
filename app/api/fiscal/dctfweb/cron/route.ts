// Fiscal · DCTFWeb — transmissão automática com encadeamento (fan-out).
//
// O Vercel Cron chama GET a cada 10 min (vercel.json). Só AGE no dia
// configurado; a primeira chamada do dia abre a RODADA (lote_inicio, sincroniza
// o Questor) e as seguintes RETOMAM a mesma rodada até não sobrar ninguém.
// Assim a rodada termina mesmo se o encadeamento abaixo falhar (no app antigo
// o elo seguinte levava 401 e só o 1º bloco era transmitido).
// Legado: Só AGE
// se hoje (Brasília) == dia configurado E a automação estiver LIGADA em
// Parâmetros. Responde na hora e processa ~45 s em background (waitUntil);
// se sobrar, chama a si mesma (POST, próximo elo). Trava por timestamp evita
// duas cadeias. Lições do phd-empresas, já embutidas:
//   - nenhum erro de elo é engolido: tudo vai para o log (notificacoes_log);
//   - o status do encadeamento é conferido; sem 202, registra e libera a trava;
//   - o segredo vai no cabeçalho E no corpo (houve 401 intermitente só com header).
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { waitUntil } from "@vercel/functions";
import {
  agoraBrasilia, definirInicioLote, definirTravaLote, obterParametros, registrarRotina, sincronizarObrigadas, transmitirLote,
} from "@/lib/dctfweb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TRAVA_MS = 120_000;   // cada elo refresca a trava; 2 min sem refresco = cadeia morta
const MAX_ELOS = 60;
const ORCAMENTO_MS = 45_000;

function confere(valor: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !valor) return false;
  const a = Buffer.from(valor), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function autorizado(req: Request, corpo?: { segredo?: string }): boolean {
  const h = req.headers.get("authorization") ?? "";
  return confere(h.startsWith("Bearer ") ? h.slice(7) : null) || confere(corpo?.segredo);
}

// Vercel Cron: início da cadeia
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const base = new URL(req.url).origin;
  waitUntil(executar({ continuar: false, elo: 0, falhas: 0, base }));
  return NextResponse.json({ ok: true, aceito: true }, { status: 202 });
}

// Encadeamento interno: próximos elos
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { segredo?: string; elo?: number; falhas?: number };
  if (!autorizado(req, corpo)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const base = new URL(req.url).origin;
  waitUntil(executar({ continuar: true, elo: Number(corpo.elo ?? 1), falhas: Number(corpo.falhas ?? 0), base }));
  return NextResponse.json({ ok: true, aceito: true }, { status: 202 });
}

async function encadear(base: string, elo: number, falhas: number): Promise<number | string> {
  const secret = process.env.CRON_SECRET ?? "";
  // A origem da requisição pode ser a URL própria do deploy, protegida pelo login
  // da Vercel (401 antes de chegar aqui). Encadeia pelo domínio de produção e, se
  // houver, manda o segredo de bypass de automação.
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const destino = prod ? `https://${prod}` : base;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const r = await fetch(`${destino}/api/fiscal/dctfweb/cron`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`, "Content-Type": "application/json",
        ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      },
      body: JSON.stringify({ elo, falhas, segredo: secret }),
    });
    return r.status;
  } catch (e) {
    return `falhou: ${e instanceof Error ? e.message : e}`;
  }
}

/** AAAA-MM-DD no fuso de Brasília. */
const dataBrasilia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function executar(c: { continuar: boolean; elo: number; falhas: number; base: string }) {
  const { competenciaAnterior: comp, diaHoje } = agoraBrasilia();
  try {
    const p = await obterParametros();
    if (!c.continuar) {
      if (!p.auto_transmissao) return;                                   // automação desligada
      if (diaHoje !== p.dia_transmissao) return;                         // não é o dia
      const ts = p.lote_ts ? Date.parse(p.lote_ts) : 0;
      if (ts && Date.now() - ts < TRAVA_MS) return;                      // já há cadeia rodando
    }
    if (c.elo > MAX_ELOS) { await definirTravaLote(null); return; }

    await definirTravaLote(new Date().toISOString());
    // Rodada de hoje já aberta? Retoma. Senão abre (marca o início e sincroniza).
    const rodadaDeHoje = !!p.lote_inicio && dataBrasilia(new Date(p.lote_inicio)) === dataBrasilia(new Date());
    let inicio = p.lote_inicio ?? new Date().toISOString();
    if (!c.continuar && !rodadaDeHoje) {
      inicio = new Date().toISOString();
      await definirInicioLote(inicio);
      try { await sincronizarObrigadas(comp); }
      catch (e) { await registrarRotina(false, { competencia: comp, elo: c.elo, etapa: "sincronizar", erro: String(e) }); }
    }

    const lote = await transmitirLote(comp, { budgetMs: ORCAMENTO_MS, inicio });
    // a cada 10 min sem nada a fazer não suja o histórico
    if (lote.processadas > 0) await registrarRotina(true, { competencia: comp, elo: c.elo, retomada: !c.continuar && rodadaDeHoje, ...lote });

    if (lote.restantes > 0 && lote.processadas > 0 && c.elo < MAX_ELOS) {
      const status = await encadear(c.base, c.elo + 1, 0);
      if (status !== 202) {
        await registrarRotina(false, { competencia: comp, elo: c.elo, erro: `não encadeou o elo ${c.elo + 1} (retorno ${status})`, restantes: lote.restantes });
        await definirTravaLote(null);
      }
    } else {
      await definirTravaLote(null);
    }
  } catch (e) {
    await registrarRotina(false, { competencia: comp, elo: c.elo, erro: e instanceof Error ? e.message : String(e) });
    if (c.falhas < 3 && c.elo < MAX_ELOS) {
      const status = await encadear(c.base, c.elo + 1, c.falhas + 1);
      if (status !== 202) await definirTravaLote(null);
    } else {
      await definirTravaLote(null);
    }
  }
}
