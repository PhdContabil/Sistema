// Carrega os processos do Societário e monta o painel (usado pela tela e pelas ações de e-mail).
import { supabaseAdmin } from "@/lib/societario/supabase";
import { sbListProcessos } from "@/lib/societario/supabase-store";
import { lerEtapas, rotuloEtapa } from "@/lib/societario/etapaProcesso";
import { acharEmail, hojeSP, montarPainel, type ProcessoPainel } from "./painel";

export async function carregarPainel(): Promise<{ hoje: string; lista: ProcessoPainel[]; emails: Record<string, string> }> {
  const [procs, etapas, pessoas] = await Promise.all([
    sbListProcessos(),
    lerEtapas(),
    supabaseAdmin().from("pessoas_perfil").select("nome,email").eq("ativo", true).not("email", "is", null).neq("modelo", true)
      .then((r) => (r.data || []) as { nome: string; email: string | null }[], () => [] as { nome: string; email: string | null }[]),
  ]);
  const manuais: Record<string, string> = {};
  for (const [id, e] of Object.entries(etapas)) manuais[id] = rotuloEtapa(e);
  const hoje = hojeSP();
  const lista = montarPainel(procs, manuais, hoje);
  const emails: Record<string, string> = {};
  for (const r of new Set(lista.map((p) => p.responsavel))) {
    const e = acharEmail(r, pessoas);
    if (e) emails[r] = e;
  }
  return { hoje, lista, emails };
}
