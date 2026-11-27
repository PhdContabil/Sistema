import { AGENDA_SEMANA, AGENDA_LEGENDA } from "@/lib/pessoas/conteudos";
import { siglaDoEvento } from "@/lib/pessoas/agenda-tipos";
import { admin } from "@/lib/pessoas/ferias";
import { eventosDoMes, hojeSP, partes, somaDias } from "@/lib/pessoas/datas-marcos";
import { carregarContexto } from "@/lib/pessoas/datas-marcos-dados";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const QTD_DIAS = 5;

function corDa(sigla: string) {
  return AGENDA_LEGENDA.find((l) => l.sigla === sigla)?.cor ?? "var(--muted)";
}

interface Marca { sigla: string; detalhe: string }

/**
 * Próximos 5 dias a partir de hoje, com as marcações reais: eventos gravados
 * (férias, reuniões…) e os calculados em Datas e Marcos (aniversários, tempo
 * de casa, datas comemorativas). As marcações fixas de AGENDA_SEMANA, quando
 * caem nestes dias, continuam aparecendo.
 */
async function marcasDosDias(dias: string[]): Promise<Map<string, Marca[]>> {
  const porDia = new Map<string, Marca[]>(dias.map((d) => [d, []]));

  for (const d of AGENDA_SEMANA) {
    if (porDia.has(d.data)) porDia.get(d.data)!.push(...d.marcas);
  }

  const ini = dias[0], fim = dias[dias.length - 1];

  const sb = admin();
  if (sb) {
    const { data } = await sb.from("eventos_agenda")
      .select("tipo,titulo,inicio,fim,detalhe").lte("inicio", fim).gte("fim", ini);
    for (const e of (data ?? []) as { tipo: string; titulo: string; inicio: string; fim: string; detalhe: string | null }[]) {
      for (const d of dias) {
        if (e.inicio <= d && e.fim >= d) porDia.get(d)!.push({ sigla: siglaDoEvento(e.tipo, e.detalhe), detalhe: e.titulo });
      }
    }
  }

  const meses = Array.from(new Set(dias.map((d) => d.slice(0, 7))));
  const ctx = await carregarContexto();
  for (const ym of meses) {
    const { a, m } = partes(`${ym}-01`);
    for (const e of eventosDoMes(a, m, ctx)) {
      if (e.campanha) continue;
      for (const d of dias) {
        if (e.inicio <= d && e.fim >= d) porDia.get(d)!.push({ sigla: siglaDoEvento(e.tipo, e.detalhe), detalhe: e.titulo });
      }
    }
  }
  return porDia;
}

export default async function AgendaSemanal() {
  const hoje = hojeSP();
  const dias = Array.from({ length: QTD_DIAS }, (_, i) => somaDias(hoje, i));
  const marcas = await marcasDosDias(dias).catch(() => new Map<string, Marca[]>());

  return (
    <section className="agenda">
      <div className="agenda-head">
        <h2 className="bloco-titulo">Agenda semanal</h2>
        <span className="agenda-nota">Passe o mouse nas marcações para ver os detalhes</span>
      </div>

      <div className="agenda-grid">
        {dias.map((data) => {
          const { a, m, d } = partes(data);
          const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
          return (
            <div key={data} className="agenda-dia">
              <div className="agenda-dow mono">{DIAS[dow]}</div>
              <div className="agenda-num">{String(d).padStart(2, "0")}</div>
              <div className="agenda-marcas">
                {(marcas.get(data) ?? []).map((mk, i) => (
                  <span key={i} className="marca mono" style={{ background: corDa(mk.sigla) }} title={mk.detalhe}>
                    {mk.sigla}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="agenda-legenda">
        {AGENDA_LEGENDA.map((l) => (
          <span key={l.sigla} className="lg">
            <span className="marca mono" style={{ background: l.cor }}>{l.sigla}</span>
            {l.rotulo}
          </span>
        ))}
        <a className="agenda-mensal" href="/m/pessoas/agenda">Agenda mensal →</a>
      </div>
    </section>
  );
}
