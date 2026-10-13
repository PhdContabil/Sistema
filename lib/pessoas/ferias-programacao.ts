// Programação de férias pelo líder / RH e controle de períodos aquisitivos — SERVIDOR.
import { admin, temVisaoDeGestores, formatarPeriodos, type PeriodoFerias } from "./ferias";
import { ehControleFerias, nomeCasa, limiteSugerido } from "./ferias-controle";
import { enviarEmail, notificarTeams, layoutEmail } from "./notificar";
import { getFeriasAVencer } from "../questor";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
/** Raiz do CNPJ da PHD no Questor (todas as filiais). */
const CNPJ_PHD = "11274011";

export interface Papel {
  email: string;
  perfil: { id: number; nome: string; setor: string; encarregado: boolean } | null;
  /** Márcio: cadastra aquisitivos e programa para todos. */
  controle: boolean;
  /** Vê e programa todos os setores (controle ou gestores). */
  todos: boolean;
  /** Pode programar (líder de setor, gestores ou controle). */
  programa: boolean;
}

export async function papelDe(email: string): Promise<Papel> {
  const sb = admin();
  const { data: p } = sb
    ? await sb.from("pessoas_perfil").select("id,nome,setor,encarregado").ilike("email", email).maybeSingle()
    : { data: null };
  const perfil = p ? { id: p.id, nome: p.nome, setor: p.setor, encarregado: !!p.encarregado } : null;
  const controle = ehControleFerias(email);
  const todos = controle || temVisaoDeGestores(email, perfil?.setor);
  return { email, perfil, controle, todos, programa: todos || !!perfil?.encarregado };
}

export interface PessoaControle {
  id: number; nome: string; setor: string; email: string | null;
  aquisitivos: {
    id: number; inicio_aquisitivo: string; fim_aquisitivo: string; limite_gozo: string;
    saldo: number | null; origem: string; observacao: string | null;
  }[];
  programacoes: {
    id: number; status: string; origem: string; aquisitivo_id: number | null;
    programado_por: string | null; periodos: { inicio: string; fim: string }[];
  }[];
}

/** Pessoas no alcance de quem pergunta, com aquisitivos e programações. */
export async function listarControle(papel: Papel): Promise<PessoaControle[]> {
  const sb = admin();
  if (!sb || !papel.programa) return [];
  let q = sb.from("pessoas_perfil").select("id,nome,setor,email")
    .eq("ativo", true).neq("modelo", true).order("setor").order("nome");
  if (!papel.todos && papel.perfil) q = q.eq("setor", papel.perfil.setor);
  const { data: pessoas } = await q;
  const ids = (pessoas ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const [{ data: aqs }, { data: sols }] = await Promise.all([
    sb.from("ferias_aquisitivos")
      .select("id,pessoa_id,inicio_aquisitivo,fim_aquisitivo,limite_gozo,saldo,origem,observacao")
      .in("pessoa_id", ids).order("inicio_aquisitivo"),
    sb.from("ferias_solicitacoes")
      .select("id,pessoa_id,status,origem,aquisitivo_id,programado_por,ferias_periodos(inicio,fim)")
      .in("pessoa_id", ids).in("status", ["pendente", "aprovada"]),
  ]);

  return (pessoas ?? []).map((p) => ({
    id: p.id, nome: p.nome, setor: p.setor, email: p.email,
    aquisitivos: (aqs ?? []).filter((a) => a.pessoa_id === p.id).map((a) => ({
      id: a.id, inicio_aquisitivo: a.inicio_aquisitivo, fim_aquisitivo: a.fim_aquisitivo,
      limite_gozo: a.limite_gozo, saldo: a.saldo == null ? null : Number(a.saldo),
      origem: a.origem, observacao: a.observacao,
    })),
    programacoes: (sols ?? []).filter((s) => s.pessoa_id === p.id).map((s) => ({
      id: s.id, status: s.status, origem: s.origem, aquisitivo_id: s.aquisitivo_id,
      programado_por: s.programado_por,
      periodos: ((s as unknown as { ferias_periodos: { inicio: string; fim: string }[] }).ferias_periodos ?? []),
    })),
  }));
}

/**
 * Líder (ou Márcio) já lança as datas combinadas: a solicitação nasce aprovada,
 * entra na agenda e a pessoa é avisada. Retorna mensagem de erro ou null.
 */
export async function programarFerias(
  papel: Papel,
  campos: { pessoa_id: number; periodos: PeriodoFerias[]; observacao?: string | null; aquisitivo_id?: number | null }
): Promise<string | null> {
  const sb = admin();
  if (!sb) return "Banco indisponível.";
  if (!papel.programa) return "Só o líder do setor ou o controle de férias podem programar.";

  const { data: pessoa } = await sb.from("pessoas_perfil")
    .select("id,nome,setor,email").eq("id", campos.pessoa_id).maybeSingle();
  if (!pessoa) return "Pessoa não encontrada.";
  if (!papel.todos && pessoa.setor !== papel.perfil?.setor) return "Você só pode programar férias do seu setor.";

  const periodos = (campos.periodos ?? []).filter((p) => p?.inicio && p?.fim);
  if (periodos.length === 0) return "Informe ao menos um período.";
  if (periodos.some((p) => p.fim < p.inicio)) return "A data final não pode ser anterior à inicial.";

  const origem = papel.controle ? "rh" : "lider";
  const agora = new Date().toISOString();
  const { data: sol, error } = await sb.from("ferias_solicitacoes").insert({
    pessoa_id: pessoa.id,
    solicitante: (pessoa.email ?? papel.email).toLowerCase(),
    setor: pessoa.setor,
    observacao: campos.observacao || null,
    status: "aprovada",
    aprovador: papel.email,
    avaliado_em: agora,
    origem,
    programado_por: papel.email,
    aquisitivo_id: campos.aquisitivo_id ?? null,
  }).select("id").single();
  if (error || !sol) return error?.message ?? "Falha ao salvar.";

  const { error: e2 } = await sb.from("ferias_periodos").insert(
    periodos.map((p) => ({ solicitacao_id: sol.id, inicio: p.inicio, fim: p.fim }))
  );
  if (e2) {
    await sb.from("ferias_solicitacoes").delete().eq("id", sol.id);
    return e2.message;
  }

  await sb.from("eventos_agenda").insert(periodos.map((p) => ({
    tipo: "ferias", titulo: `Férias: ${pessoa.nome}`, pessoa_id: pessoa.id,
    inicio: p.inicio, fim: p.fim, detalhe: pessoa.setor, origem: `ferias:${sol.id}`,
  })));

  if (pessoa.email) {
    const resumo = formatarPeriodos(periodos);
    const quem = papel.perfil?.nome ?? papel.email;
    const link = `${BASE}/m/pessoas/ferias`;
    await enviarEmail(pessoa.email, "Suas férias foram programadas", layoutEmail(
      "Suas férias foram programadas",
      `<p>Olá, ${pessoa.nome}.</p><p>${quem} programou suas férias: <strong>${resumo}</strong>.</p>
       ${campos.observacao ? `<p><strong>Observação:</strong> ${campos.observacao}</p>` : ""}
       <p>O período já aparece na agenda do escritório. Se algo não bate com o combinado, fale com seu líder.</p>`,
      { texto: "Ver minhas férias", url: link }
    ));
    await notificarTeams(pessoa.email, "Suas férias foram programadas", `${quem} programou suas férias: ${resumo}.`, link);
  }
  return null;
}

/** Cadastro manual do Márcio (cria ou atualiza pelo início do aquisitivo). */
export async function salvarAquisitivo(
  papel: Papel,
  c: { pessoa_id: number; inicio_aquisitivo: string; fim_aquisitivo: string; limite_gozo?: string | null; saldo?: number | null; observacao?: string | null }
): Promise<string | null> {
  const sb = admin();
  if (!sb) return "Banco indisponível.";
  if (!papel.controle) return "Só o controle de férias (Márcio) cadastra períodos aquisitivos.";
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(c.inicio_aquisitivo ?? "") || !re.test(c.fim_aquisitivo ?? "")) return "Informe o período aquisitivo completo.";
  if (c.fim_aquisitivo < c.inicio_aquisitivo) return "O fim do aquisitivo não pode ser antes do início.";
  const limite = c.limite_gozo && re.test(c.limite_gozo) ? c.limite_gozo : limiteSugerido(c.fim_aquisitivo);
  const { error } = await sb.from("ferias_aquisitivos").upsert({
    pessoa_id: c.pessoa_id, inicio_aquisitivo: c.inicio_aquisitivo, fim_aquisitivo: c.fim_aquisitivo,
    limite_gozo: limite, saldo: c.saldo ?? null, observacao: c.observacao || null,
    origem: "manual", atualizado_por: papel.email, atualizado_em: new Date().toISOString(),
  }, { onConflict: "pessoa_id,inicio_aquisitivo" });
  return error?.message ?? null;
}

export async function excluirAquisitivo(papel: Papel, id: number): Promise<string | null> {
  const sb = admin();
  if (!sb) return "Banco indisponível.";
  if (!papel.controle) return "Só o controle de férias (Márcio) altera períodos aquisitivos.";
  const { error } = await sb.from("ferias_aquisitivos").delete().eq("id", id);
  return error?.message ?? null;
}

/**
 * Importa do Questor os períodos aquisitivos abertos dos funcionários da PHD.
 * Casa pelo código do funcionário já vinculado; senão pelo nome (o nome curto
 * do cadastro precisa estar contido no nome completo, e só um funcionário pode
 * casar). Períodos com limite vencido há mais de um ano ficam de fora: no
 * Questor costumam ser saldo antigo não baixado, e encheriam a tela de vermelho.
 */
export async function importarDoQuestor(papel: Papel) {
  const sb = admin();
  if (!sb) throw new Error("Banco indisponível.");
  if (!papel.controle) throw new Error("Só o controle de férias (Márcio) importa do Questor.");

  const r = await getFeriasAVencer({ cnpj: CNPJ_PHD });
  const { data: pessoas } = await sb.from("pessoas_perfil")
    .select("id,nome,questor_codigofunc").eq("ativo", true).neq("modelo", true);
  const lista = pessoas ?? [];
  const hoje = new Date().toISOString().slice(0, 10);
  const umAnoAtras = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  let importados = 0;
  const semVinculo = new Set<string>();
  const antigos: string[] = [];
  const vinculos = new Map<number, number>(); // codigofunc -> pessoa_id

  for (const l of r.dados) {
    let pessoaId = lista.find((p) => p.questor_codigofunc === l.codigofunccontr)?.id ?? vinculos.get(l.codigofunccontr);
    if (!pessoaId) {
      const casam = lista.filter((p) => !p.questor_codigofunc && nomeCasa(p.nome, l.nomefunc));
      if (casam.length === 1) {
        pessoaId = casam[0].id;
        vinculos.set(l.codigofunccontr, pessoaId);
        await sb.from("pessoas_perfil").update({ questor_codigofunc: l.codigofunccontr }).eq("id", pessoaId);
        casam[0].questor_codigofunc = l.codigofunccontr;
      }
    }
    if (!pessoaId) { semVinculo.add(l.nomefunc); continue; }
    if (l.limite_sem_dobra < umAnoAtras) { antigos.push(`${l.nomefunc} (${l.inicio_aquisitivo})`); continue; }

    const { error } = await sb.from("ferias_aquisitivos").upsert({
      pessoa_id: pessoaId, inicio_aquisitivo: l.inicio_aquisitivo, fim_aquisitivo: l.fim_aquisitivo,
      limite_gozo: l.limite_sem_dobra, saldo: l.saldo, origem: "questor",
      atualizado_por: `questor (${papel.email})`, atualizado_em: new Date().toISOString(),
    }, { onConflict: "pessoa_id,inicio_aquisitivo" });
    if (!error) importados++;
  }
  return { dataBase: r.data_base ?? hoje, lidos: r.dados.length, importados, semVinculo: [...semVinculo], antigos };
}
