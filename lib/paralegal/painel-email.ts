// Textos dos e-mails do Painel Gerencial (relatório e cobrança).
import { dataBR, resumir, ROTULO_ALERTA, type Alerta, type ProcessoPainel } from "./painel";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COR: Partial<Record<Alerta, string>> = { atrasado: "#b91c1c", vence_2d: "#b45309", vence_7d: "#8a6d00", sem_pendencia: "#1d7a3f" };
const TD = 'style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px"';
const TH = 'style="padding:6px 8px;text-align:left;background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#475569"';

function tabela(ps: ProcessoPainel[]): string {
  const linhas = ps.map((p) => {
    const onde = [p.etapaManual, p.etapaAtual].filter(Boolean).map(esc).join("<br>");
    return `<tr><td ${TD}><b>${esc(p.nome)}</b></td><td ${TD}>${esc(p.responsavel)}</td><td ${TD}>${onde}${p.etapaPrazo ? `<br><small>prazo ${dataBR(p.etapaPrazo)}</small>` : ""}</td>` +
      `<td ${TD}>${p.feitas} feitas · ${p.falta} faltam</td><td ${TD}><b style="color:${COR[p.alerta] || "#475569"}">${ROTULO_ALERTA[p.alerta]}</b></td></tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;width:100%"><tr><th ${TH}>Empresa</th><th ${TH}>Responsável</th><th ${TH}>Onde está</th><th ${TH}>Andamento</th><th ${TH}>Alerta</th></tr>${linhas}</table>`;
}

const LIMITE = 80;

export function emailRelatorio(ps: ProcessoPainel[], todos: ProcessoPainel[], hoje: string, enviadoPor: string, filtroTexto: string) {
  const r = resumir(todos);
  const resto = ps.length > LIMITE ? `<p style="color:#64748b">Mostrando os ${LIMITE} primeiros de ${ps.length}. A lista completa está no Painel Gerencial do Núcleo.</p>` : "";
  return {
    assunto: `Painel Gerencial do Paralegal — ${dataBR(hoje)}`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;max-width:900px">
<h2 style="margin:0 0 4px">Painel Gerencial do Paralegal</h2>
<p style="color:#64748b;margin:0 0 14px">${dataBR(hoje)} · enviado por ${esc(enviadoPor)}${filtroTexto ? ` · filtro: ${esc(filtroTexto)}` : ""}</p>
<p><b>${r.ativos}</b> processos ativos · <b style="color:#b91c1c">${r.atrasados}</b> atrasados · <b style="color:#b45309">${r.vence2d}</b> vencem em 2 dias · <b style="color:#8a6d00">${r.vence7d}</b> vencem em 7 dias · <b style="color:#1d7a3f">${r.prontos}</b> prontos para concluir · ${r.faltam} atividades faltando</p>
${tabela(ps.slice(0, LIMITE))}${resto}</div>`,
  };
}

export function emailCobranca(ps: ProcessoPainel[], responsavel: string, hoje: string, cobradoPor: string, recado: string) {
  const blocos = ps.map((p) => {
    const itens = p.abertas.filter((a) => ["atrasada", "vence_2d", "vence_7d"].includes(a.categoria) || ps.length === 1)
      .map((a) => `<li>${esc(a.ordem)} — ${esc(a.nome)} <small>(${a.prazo ? `prazo ${dataBR(a.prazo)}` : "sem prazo"}${a.dias !== null && a.dias < 0 ? `, ${-a.dias} dia(s) de atraso` : ""})</small></li>`).join("");
    return `<p style="margin:14px 0 4px"><b>${esc(p.nome)}</b> — <b style="color:${COR[p.alerta] || "#475569"}">${ROTULO_ALERTA[p.alerta]}</b><br><small>${[p.etapaManual, p.etapaAtual].filter(Boolean).map(esc).join(" · ")}</small></p><ul style="margin:0">${itens}</ul>`;
  }).join("");
  const nome = responsavel.split(" ")[0];
  return {
    assunto: `Pendências no Societário — ${ps.length === 1 ? ps[0].nome : `${ps.length} processos`}`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;max-width:760px">
<p>Olá, ${esc(nome)}!</p>
<p>${recado ? esc(recado).replace(/\n/g, "<br>") : "Passando para lembrar das pendências abaixo, que estão atrasadas ou perto de vencer. Pode me dar um retorno sobre o andamento?"}</p>
${blocos}
<p style="color:#64748b;font-size:12px;margin-top:18px">Cobrança enviada por ${esc(cobradoPor)} em ${dataBR(hoje)}, pelo Painel Gerencial do Núcleo. Responda diretamente a ${esc(cobradoPor)}.</p></div>`,
  };
}
