// Fiscal › Notas Fiscais -> Tareffa (SERVIDOR). Mesmo fluxo do DARE SP: publica
// o PDF da NFS-e e o Tareffa lê o documento e dá a baixa do serviço. Sem Zen.
import { db, pdfPorChave } from "@/lib/nfse/procuracao";
import { publicarNoTareffa, tareffaConfigurado } from "@/lib/tareffa-documentos";

/** "NFS-e 10-2026 123 12345678000199.pdf" — competência com hífen (barra vira caminho). */
export function nomeArquivoNota(n: { dcompet: string; nnfse: string | null; cnpj: string | null }) {
  const [a, m] = String(n.dcompet ?? "").split("-");
  return `NFS-e ${m}-${a} ${n.nnfse ?? ""} ${String(n.cnpj ?? "").replace(/\D/g, "")}.pdf`.replace(/\s+/g, " ");
}

export async function enviarNotaAoTareffa(id: number): Promise<{ ok: boolean; mensagem: string }> {
  const sb = db();
  const { data: n } = await sb.from("mei_nfse").select("id,cnpj,dcompet,nnfse,chave_acesso,status")
    .eq("id", id).eq("origem", "fiscal").maybeSingle();
  if (!n || n.status !== "emitida" || !n.chave_acesso) return { ok: false, mensagem: "Nota não encontrada ou não emitida." };
  const gravar = (campos: Record<string, unknown>) => sb.from("mei_nfse").update(campos).eq("id", id);
  if (!tareffaConfigurado()) {
    const m = "Tareffa não configurado no servidor (TAREFFA_CLIENT_ID, TAREFFA_CLIENT_SECRET, TAREFFA_EMAIL e TAREFFA_SENHA).";
    await gravar({ tareffa_erro: m });
    return { ok: false, mensagem: m };
  }
  try {
    const pdf = await pdfPorChave(n.chave_acesso as string);
    const r = await publicarNoTareffa(nomeArquivoNota(n as never), Buffer.from(pdf));
    await gravar({ tareffa_documento_id: r.documentoId, tareffa_enviado_em: new Date().toISOString(), tareffa_erro: null });
    return { ok: true, mensagem: "Nota enviada ao Tareffa." };
  } catch (e) {
    const m = e instanceof Error ? e.message : "falha desconhecida";
    await gravar({ tareffa_erro: m.slice(0, 2000) });
    return { ok: false, mensagem: m };
  }
}
