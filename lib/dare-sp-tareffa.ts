// DARE SP -> Tareffa (SERVIDOR). Passo seguinte ao Zen: com a guia no Edoc,
// publica o mesmo PDF no Tareffa, que lê o documento e dá a baixa do serviço.

import { publicarNoTareffa, tareffaConfigurado } from "./tareffa-documentos";
import { tituloDoZen } from "./dare-sp-zen-formato";
import { marcarTareffa } from "./dare-sp";

export { tareffaConfigurado };

/**
 * Publica a guia no Tareffa e grava o resultado nela.
 *
 * Nunca lança: devolve o motivo da falha, para quem chamou mostrar como aviso.
 * A guia e o Zen já deram certo neste ponto — o Tareffa falhar não pode
 * desfazer nada disso, só ficar pendente para reenviar.
 */
export async function enviarGuiaAoTareffa(g: {
  id: string; codigoImposto: string; competencia: string; cnpj: string; pdfBase64: string;
}): Promise<string | null> {
  if (!tareffaConfigurado()) {
    const m = "Tareffa não configurado no servidor (TAREFFA_CLIENT_ID, TAREFFA_CLIENT_SECRET, TAREFFA_EMAIL e TAREFFA_SENHA).";
    await marcarTareffa(g.id, { erro: m });
    return m;
  }
  try {
    // Mesmo nome do título no Zen: é dele que o Tareffa tira serviço e
    // competência (NOMEINTERNO no log de documentos publicados).
    const nome = `${tituloDoZen(g.codigoImposto, g.competencia).replace("/", "-")} ${(g.cnpj ?? "").replace(/\D/g, "")}.pdf`;
    const r = await publicarNoTareffa(nome, Buffer.from(g.pdfBase64, "base64"));
    await marcarTareffa(g.id, { documentoId: r.documentoId });
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : "falha desconhecida";
    console.error("[dare-sp/tareffa]", m);
    await marcarTareffa(g.id, { erro: m });
    return m;
  }
}
