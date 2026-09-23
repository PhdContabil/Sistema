// Monta o e-mail da Roda da Vida.
//
// A roda vai como barras horizontais, não como o SVG da tela: cliente de
// e-mail (Outlook à frente) descarta SVG e a pessoa receberia um buraco no
// lugar do resultado. Barra feita de <td> com largura em porcentagem funciona
// em qualquer um deles, e diz a mesma coisa.

import { DIMENSOES, DIMENSAO_POR_ID, EMAIL } from "./roda-vida-conteudo";
import { corDaNota, media, type Notas } from "./roda-vida-calculo";

function escapar(t: string): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DadosEmail {
  nome: string | null;
  notas: Notas;
  reflexao: string | null;
  acoes: { dimensao: string; acao: string }[];
  fechadaEm: string;
}

/** Corpo HTML do e-mail. */
export function montarEmail(d: DadosEmail): string {
  const m = media(d.notas, DIMENSOES);

  const linhas = DIMENSOES.map((dim) => {
    const nota = Number(d.notas[dim.id] ?? 0);
    const cor = corDaNota(nota);
    return `
      <tr>
        <td style="padding:5px 10px 5px 0;font-size:14px;color:#334155;white-space:nowrap">
          ${dim.emoji} ${escapar(dim.nome)}
        </td>
        <td style="padding:5px 0;width:100%">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#e2e8f0;border-radius:4px">
            <tr><td style="width:${nota * 10}%;background:${cor};height:10px;border-radius:4px;font-size:0">&nbsp;</td><td></td></tr>
          </table>
        </td>
        <td style="padding:5px 0 5px 10px;font-size:15px;font-weight:700;color:${cor}">${nota}</td>
      </tr>`;
  }).join("");

  // Agrupa as ações por dimensão, na ordem em que as dimensões aparecem.
  const porDimensao = DIMENSOES.map((dim) => ({
    dim,
    itens: d.acoes.filter((a) => a.dimensao === dim.id),
  })).filter((g) => g.itens.length > 0);

  const acoes = porDimensao.length === 0
    ? `<p style="font-size:14px;color:#64748b;margin:0">
         Você ainda não escolheu ações — dá para voltar ao sistema e escolher quando quiser.
       </p>`
    : porDimensao.map((g) => `
        <div style="margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:6px">
            ${g.dim.emoji} ${escapar(g.dim.nome)}
          </div>
          ${g.itens.map((i) => `
            <div style="font-size:14px;color:#334155;line-height:1.6;padding-left:14px;
                        border-left:3px solid ${corDaNota(Number(d.notas[g.dim.id] ?? 0))};margin-bottom:6px">
              ${escapar(i.acao)}
            </div>`).join("")}
        </div>`).join("");

  const perguntas = EMAIL.perguntas.map((p) => `
    <div style="font-size:15px;color:#0f172a;margin:0 0 14px;padding-bottom:14px;
                border-bottom:1px dashed #cbd5e1">
      ${p.emoji} <strong>${escapar(p.texto)}</strong>
    </div>`).join("");

  const reflexao = d.reflexao
    ? `<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 14px;
                   margin:0 0 22px;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">
         <strong style="display:block;margin-bottom:4px;color:#0f172a">O que a minha roda me disse</strong>
         ${escapar(d.reflexao)}
       </div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0"
       style="max-width:640px;width:100%;background:#fff;border-radius:14px;overflow:hidden;
              font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">

  <tr><td style="background:#3f9142;padding:22px 26px">
    <div style="color:#fff;font-size:19px;font-weight:700">Sua Roda da Vida</div>
    <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:3px">PHD Contábil</div>
  </td></tr>

  <tr><td style="padding:26px">
    <p style="font-size:17px;font-weight:700;color:#0f172a;margin:0 0 14px">
      ${EMAIL.saudacao}${d.nome ? ` ${escapar(d.nome.split(" ")[0])}!` : ""}
    </p>
    ${EMAIL.paragrafos.map((t) =>
      `<p style="font-size:14px;color:#334155;line-height:1.7;margin:0 0 10px">${escapar(t)}</p>`
    ).join("")}

    <p style="font-size:15px;color:#0f172a;font-weight:600;line-height:1.6;margin:20px 0 22px">
      ${escapar(EMAIL.chamada)}
    </p>

    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px">
      Como ficou a sua roda
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:8px">
      ${linhas}
    </table>
    <p style="font-size:13px;color:#64748b;margin:0 0 22px">
      Média geral <strong style="color:${corDaNota(m)};font-size:15px">${m.toFixed(1)}</strong>
      · preenchida em ${escapar(d.fechadaEm)}
    </p>

    ${reflexao}

    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:10px">
      As ações que você escolheu
    </div>
    ${acoes}

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:24px 0 0">
      <p style="font-size:14px;color:#334155;line-height:1.7;margin:0 0 16px">
        ${escapar(EMAIL.introCompromisso)}
      </p>
      ${perguntas}
      <p style="font-size:14px;color:#334155;line-height:1.7;margin:16px 0 0">
        ${escapar(EMAIL.fecho)}
      </p>
    </div>

    <p style="font-size:15px;font-style:italic;color:#3f9142;text-align:center;margin:24px 0 0">
      ${escapar(EMAIL.assinatura)}
    </p>
  </td></tr>

  <tr><td style="background:#f8fafc;padding:14px 26px;font-size:11px;color:#94a3b8;text-align:center">
    Você recebeu este e-mail porque cadastrou seu endereço na Roda da Vida do Núcleo Contábil.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Nome da dimensão, para mensagens curtas fora do corpo do e-mail. */
export function nomeDaDimensao(id: string): string {
  return DIMENSAO_POR_ID[id]?.nome ?? id;
}
