// Leva as férias aprovadas/programadas no Núcleo para a programação do Questor
// (POST /rh/ferias/programacao). SERVIDOR.
//
// Cada período vira uma programação no Questor; o DP calcula o recibo a partir
// dela, como já faz. Falha aqui NÃO desfaz a aprovação: fica gravada no período
// (questor_erro) e aparece na tela para reenviar.
import { admin, diasEntre } from "./ferias";
import { programarFeriasQuestor, type RespostaProgramacaoFerias } from "../questor";

/** Só estas empresas aceitam escrita na API (PHD Contábil, Digital, Negócios). */
const EMPRESAS_ESCRITA = [725, 893, 128];

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.mensagem ?? o.msg ?? o.message ?? o.detail ?? JSON.stringify(o));
  }
  return String(v);
}

export interface ResultadoQuestor { enviados: number; falhas: string[]; avisos: string[] }

/**
 * Envia ao Questor os períodos ainda não enviados de uma solicitação aprovada.
 * Primeiro dry_run (para colher erros de regra em português); sem erro, grava.
 */
export async function enviarFeriasAoQuestor(solicitacaoId: number, usuario: string): Promise<ResultadoQuestor> {
  const res: ResultadoQuestor = { enviados: 0, falhas: [], avisos: [] };
  const sb = admin();
  if (!sb) { res.falhas.push("Banco indisponível."); return res; }

  const { data: sol } = await sb.from("ferias_solicitacoes")
    .select("id,pessoa_id,status,aquisitivo_id").eq("id", solicitacaoId).maybeSingle();
  if (!sol || sol.status !== "aprovada") return res;

  // Funcionário no Questor: o do período aquisitivo vinculado; senão o mais
  // recente importado do Questor para a pessoa.
  const { data: aqs } = await sb.from("ferias_aquisitivos")
    .select("id,codigoempresa,codigofunc,inicio_aquisitivo,fim_aquisitivo,limite_gozo")
    .eq("pessoa_id", sol.pessoa_id).not("codigofunc", "is", null).order("inicio_aquisitivo", { ascending: false });
  const vinculado = (aqs ?? []).find((a) => a.id === sol.aquisitivo_id);
  const base = vinculado ?? (aqs ?? [])[0];

  const { data: periodos } = await sb.from("ferias_periodos")
    .select("id,inicio,fim,questor_prog_id").eq("solicitacao_id", sol.id).order("inicio");
  const pendentes = (periodos ?? []).filter((p) => !p.questor_prog_id);
  if (pendentes.length === 0) return res;

  const marcarErro = async (id: number, erro: string) => {
    await sb.from("ferias_periodos").update({ questor_erro: erro.slice(0, 900) }).eq("id", id);
    res.falhas.push(erro);
  };

  if (!base || !EMPRESAS_ESCRITA.includes(base.codigoempresa)) {
    for (const p of pendentes) {
      await marcarErro(p.id, "Pessoa sem vínculo com funcionário do Questor. Use 'Buscar do Questor' no controle de férias e reenvie.");
    }
    return res;
  }

  for (const p of pendentes) {
    const dados = {
      usuario,
      codigoempresa: base.codigoempresa,
      codigofunccontr: base.codigofunc as number,
      inicio: p.inicio,
      dias_ferias: Math.min(30, diasEntre(p.inicio, p.fim)),
      // Período aquisitivo só quando a programação foi feita para um específico;
      // senão a API usa o mais antigo aberto, já concluído e com saldo.
      datainicial_periodo: vinculado ? vinculado.inicio_aquisitivo : null,
    };
    try {
      const teste = await programarFeriasQuestor(dados, { dryRun: true });
      const errosTeste = texto(teste.corpo.erros) || (!teste.ok ? texto(teste.corpo.detail ?? teste.corpo.erro) || `HTTP ${teste.status}` : "");
      if (errosTeste) { await marcarErro(p.id, `Questor recusou: ${errosTeste}`); continue; }

      const r = await programarFeriasQuestor(dados, { dryRun: false, idempotencyKey: `nucleo-ferias-periodo-${p.id}` });
      const c: RespostaProgramacaoFerias = r.corpo;
      if (!r.ok || !c.id) {
        await marcarErro(p.id, `Questor recusou: ${texto(c.erros) || texto(c.detail ?? c.erro) || `HTTP ${r.status}`}`);
        continue;
      }
      const avisos = texto(c.avisos);
      if (avisos) res.avisos.push(avisos);
      await sb.from("ferias_periodos").update({
        questor_prog_id: c.id, questor_codigoempresa: base.codigoempresa,
        questor_data_pagamento: c.data_pagamento ?? null, questor_enviado_em: new Date().toISOString(),
        questor_erro: null, questor_avisos: avisos || null,
      }).eq("id", p.id);
      res.enviados++;
    } catch (e) {
      await marcarErro(p.id, `Sem resposta do Questor: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return res;
}
