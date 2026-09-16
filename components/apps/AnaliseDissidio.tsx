"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calcular, variacaoMensalidade, formatBRL, formatNum, formatPct, formatCNPJ } from "@/lib/dissidio-calculo";
import { formatDataHora, agoraFormatado } from "@/lib/datas";
import {
  RESPONSAVEIS, RESPONSAVEL_NOME,
  type PerfilEmpresa, type PerfilServico, type PerfilAno,
  type Rodada, type Ajuste, type MarcadorEmpresa,
} from "@/lib/dissidio-tipos";

interface PreviaGrupos {
  casados: { codigoempresa: number; nome: string | null; grupo: string; pasta: string;
             confianca: "codigo" | "exata" | "provavel" }[];
  ambiguas: { pasta: string; grupo: string; candidatos: number[] }[];
  pastasSemEmpresa: { pasta: string; grupo: string }[];
  totalPastas?: number;
}

interface PreviaBoletos {
  gerados: { codigoempresa: number; codigocliente: number; empresa: string | null; aba: string }[];
  semEmpresa: { aba: string; codigofinanceiro: number; empresa: string | null; ok: boolean }[];
  ambiguos: { codigofinanceiro: number; aba: string; candidatos: number[] }[];
  abasComErro: { aba: string; erro: string }[];
  totalLinhas: number;
  colunaStatus?: string;
}

type Situacao =
  | "todas" | "ajustadas" | "pendentes" | "sem_mensalidade"
  | "ok" | "falta_definir" | "gerado" | "nao_gerado";
type Ordenar =
  | "nome" | "mensalidade" | "faturamento" | "empregados" | "horas"
  | "diferenca" | "percentual" | "responsavel" | "grupo"
  | "serv_dp" | "serv_contabil" | "serv_fiscal" | "valor_novo";

const POR_PAGINA = 50;

function anoDe(e: PerfilEmpresa, ano: number): PerfilAno | undefined {
  return e.anos?.find((x: PerfilAno) => x.ano === ano);
}

/**
 * Mensalidade do bloco de um ano — vem direto da API.
 * Ano fechado = vigente em 31/12; ano corrente = vigente hoje.
 */
function mensalidadeDoAno(e: PerfilEmpresa, ano: number): number | null {
  return anoDe(e, ano)?.mensalidade_total ?? null;
}

/**
 * Reajuste que a empresa levou em um ano: variação da própria mensalidade
 * contra a do ano anterior. Lê do contrato, não das rodadas salvas aqui — por
 * isso enxerga também os anos anteriores ao sistema existir.
 */
function reajusteDoAno(e: PerfilEmpresa, a: number): number | null {
  return variacaoMensalidade(mensalidadeDoAno(e, a), mensalidadeDoAno(e, a - 1));
}

/** Estado editável de uma empresa na tela (rascunho, ainda não gravado). */
interface Rascunho {
  percentual: string;
  valor_novo: string;
  observacao: string;
  blacklist: boolean;
  blacklist_motivo: string;
  responsavel: string;
  grupo: string;
  definido: boolean;
  gerado: boolean;
  /** `analisado_em` que veio do servidor — detecta edição simultânea. */
  visto_em: string | null;
}

function rascunhoDe(aj: Ajuste | undefined, mk: MarcadorEmpresa | undefined): Rascunho {
  // Só decisão INDIVIDUAL preenche os campos. Toda empresa tem uma linha
  // gravada — inclusive as que apenas seguem a regra geral, com percentual e
  // valor_novo derivados. Preencher os campos com esses valores derivados fazia
  // a tela tratá-los como digitados à mão: o `valor_novo` mandava, o percentual
  // aparecia vazio e a regra geral parava de ser recalculada. Campo vazio é o
  // que significa "segue o percentual da rodada".
  const meu = aj?.individual ? aj : undefined;
  return {
    percentual: meu && meu.origem !== "valor" && meu.percentual != null ? String(meu.percentual) : "",
    valor_novo: meu && meu.origem === "valor" && meu.valor_novo != null ? String(meu.valor_novo) : "",
    observacao: aj?.observacao ?? "",
    blacklist: mk?.blacklist ?? false,
    blacklist_motivo: mk?.blacklist_motivo ?? "",
    responsavel: mk?.responsavel ?? "",
    grupo: mk?.grupo ?? "",
    definido: aj?.definido ?? false,
    gerado: aj?.gerado ?? false,
    visto_em: aj?.analisado_em ?? null,
  };
}

/**
 * Mensalidade atual por serviço. Vem pronta da API (bloco `mensalidade`), que
 * ja soma os contratos vigentes de cada conta — nao ha rateio a fazer aqui.
 *
 * Diferente dos indicadores acima, nao tem serie por ano: e a foto de hoje.
 * Por isso ocupa um bloco proprio, com uma coluna por servico.
 */
const SERVICOS = [
  { id: "dp", nome: "DP", ordena: "serv_dp" as Ordenar },
  { id: "contabil", nome: "Contábil", ordena: "serv_contabil" as Ordenar },
  { id: "fiscal", nome: "Fiscal", ordena: "serv_fiscal" as Ordenar },
] as const;

/** Valor do serviço na empresa; 0 e "nao contratado". */
function valorServico(e: PerfilEmpresa, id: string): number {
  const m = e.mensalidade;
  if (!m) return 0;
  if (id === "dp") return Number(m.dp ?? 0);
  if (id === "contabil") return Number(m.contabil ?? 0);
  if (id === "fiscal") return Number(m.fiscal ?? 0);
  if (id === "manutencao") return Number(m.manutencao ?? 0);
  if (id === "demais") return Number(m.demais ?? 0);
  return 0;
}

/** Opcoes do filtro — inclui contas que nao viram coluna, mas servem de recorte. */
const SERVICOS_FILTRO = [
  { id: "dp", nome: "DP" },
  { id: "contabil", nome: "Contábil" },
  { id: "fiscal", nome: "Fiscal" },
  { id: "manutencao", nome: "Manutenção" },
  { id: "demais", nome: "Demais" },
] as const;

/** Indicadores da tabela — cada um vira um bloco com os anos dentro. */
const INDICADORES = [
  { id: "faturamento", nome: "Faturamento médio", ordena: "faturamento" as Ordenar },
  { id: "empregados", nome: "Empregados", ordena: "empregados" as Ordenar },
  { id: "horas", nome: "Horas/mês", ordena: "horas" as Ordenar },
  { id: "mensalidade", nome: "Mensalidade", ordena: "mensalidade" as Ordenar },
  { id: "reajuste", nome: "Reajuste aplicado", ordena: null },
] as const;

export default function AnaliseDissidio({
  ano, anosDisponiveis, anosComparados, anosDetalhe, empresas, rodada,
  ajustesIniciais, marcadoresIniciais, meuEmail, erroServidor,
}: {
  ano: number;
  anosDisponiveis: number[];
  anosComparados: number[];
  anosDetalhe: number[];
  empresas: PerfilEmpresa[];
  rodada: Rodada | null;
  ajustesIniciais: Ajuste[];
  marcadoresIniciais: MarcadorEmpresa[];
  meuEmail: string | null;
  erroServidor: string | null;
}) {
  const router = useRouter();

  const ajustes = useMemo(
    () => new Map(ajustesIniciais.map((a) => [a.codigoempresa, a])),
    [ajustesIniciais]
  );
  const marcadores = useMemo(
    () => new Map(marcadoresIniciais.map((m) => [m.codigoempresa, m])),
    [marcadoresIniciais]
  );

  const [rascunhos, setRascunhos] = useState<Map<number, Rascunho>>(new Map());
  const [percGeral, setPercGeral] = useState(String(rodada?.percentual_geral ?? 0));
  const [obsAno, setObsAno] = useState(rodada?.observacao ?? "");
  const cabecalhoMudou =
    String(rodada?.percentual_geral ?? 0) !== percGeral || (rodada?.observacao ?? "") !== obsAno;

  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [regimes, setRegimes] = useState<string[]>([]);
  const [atividadesSel, setAtividadesSel] = useState<string[]>([]);
  const [responsaveisSel, setResponsaveisSel] = useState<string[]>([]);
  const [gruposSel, setGruposSel] = useState<string[]>([]);
  const [percentuaisSel, setPercentuaisSel] = useState<string[]>([]);
  const [servicosSel, setServicosSel] = useState<string[]>([]);
  const [soBlacklist, setSoBlacklist] = useState(false);
  const [soAtivas, setSoAtivas] = useState(true);
  const [ordenar, setOrdenar] = useState<Ordenar>("nome");
  const [desc, setDesc] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [obsAberta, setObsAberta] = useState(false);
  const [previa, setPrevia] = useState<PreviaGrupos | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [previaBoletos, setPreviaBoletos] = useState<PreviaBoletos | null>(null);
  const [sincronizandoBoletos, setSincronizandoBoletos] = useState(false);
  const [conflitos, setConflitos] = useState<{ codigoempresa: number; por: string | null; em: string }[]>([]);

  const percentualGeral = Number(String(percGeral).replace(",", ".")) || 0;
  const anoRecente = anosComparados[anosComparados.length - 1];
  const pendentes = rascunhos.size;

  useEffect(() => {
    if (!aviso) return;
    // Avisos com "⚠️" (ex.: sincronização de boletos incompleta) ficam mais
    // tempo na tela — são exceção, não a confirmação de rotina de um salvamento.
    const t = setTimeout(() => setAviso(null), aviso.includes("⚠️") ? 12000 : 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => { setPagina(1); }, [
    busca, situacao, regimes, atividadesSel, responsaveisSel, gruposSel,
    percentuaisSel, servicosSel, soBlacklist, soAtivas, ordenar, desc,
  ]);

  useEffect(() => {
    if (pendentes === 0 && !cabecalhoMudou) return;
    const sair = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, [pendentes, cabecalhoMudou]);

  const editar = useCallback((cod: number, campos: Partial<Rascunho>) => {
    setRascunhos((antes) => {
      const m = new Map(antes);
      const atual = m.get(cod) ?? rascunhoDe(ajustes.get(cod), marcadores.get(cod));
      m.set(cod, { ...atual, ...campos });
      return m;
    });
  }, [ajustes, marcadores]);

  const estadoDe = useCallback(
    (cod: number): Rascunho => rascunhos.get(cod) ?? rascunhoDe(ajustes.get(cod), marcadores.get(cod)),
    [rascunhos, ajustes, marcadores]
  );

  const listaRegimes = useMemo(
    () => [...new Set(empresas.map((e) => e.regime).filter(Boolean) as string[])].sort(),
    [empresas]
  );
  const listaAtividades = useMemo(
    () => [...new Set(empresas.map((e) => e.atividade?.descricao).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [empresas]
  );
  // Inclui o que ainda está em rascunho: quem acabou de digitar um grupo novo
  // precisa conseguir filtrar por ele antes de salvar.
  const listaGrupos = useMemo(
    () => [...new Set([
      ...marcadoresIniciais.map((m) => m.grupo),
      ...[...rascunhos.values()].map((r) => r.grupo),
    ].map((g) => (g ?? "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [marcadoresIniciais, rascunhos]
  );

  /** Faixas de percentual — filtrar por valor exato seria inútil com decimais. */
  const FAIXAS = useMemo(() => [
    { id: "zero", nome: "Sem reajuste (0%)", testa: (p: number | null) => p === 0 },
    { id: "ate3", nome: "Até 3%", testa: (p: number | null) => p !== null && p > 0 && p <= 3 },
    { id: "3a5", nome: "3% a 5%", testa: (p: number | null) => p !== null && p > 3 && p <= 5 },
    { id: "5a8", nome: "5% a 8%", testa: (p: number | null) => p !== null && p > 5 && p <= 8 },
    { id: "acima8", nome: "Acima de 8%", testa: (p: number | null) => p !== null && p > 8 },
    { id: "negativo", nome: "Redução (negativo)", testa: (p: number | null) => p !== null && p < 0 },
  ], []);

  /**
   * Traz as pastas do SharePoint e mostra o que casaria — sem gravar nada.
   * Gravar direto seria arriscado: o casamento por nome pode errar, e é justo
   * esse subconjunto que a pessoa precisa olhar antes de aceitar.
   */
  async function verGrupos() {
    setSincronizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/dissidio/grupos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao ler as pastas do SharePoint.");
      setPrevia(j as PreviaGrupos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler as pastas.");
    } finally {
      setSincronizando(false);
    }
  }

  async function aplicarGrupos(incluirProvaveis: boolean) {
    setSincronizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/dissidio/grupos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incluirProvaveis }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao gravar os grupos.");
      setPrevia(null);
      setAviso(`${j.gravados} empresa(s) com grupo definido.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar os grupos.");
    } finally {
      setSincronizando(false);
    }
  }

  /**
   * Lê a planilha de boletos do financeiro (SharePoint) e mostra quantas
   * empresas bateriam pelo código financeiro — sem gravar nada ainda.
   */
  async function verBoletos() {
    setSincronizandoBoletos(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dissidio/boletos?ano=${ano}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao ler a planilha de boletos.");
      setPreviaBoletos(j as PreviaBoletos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha de boletos.");
    } finally {
      setSincronizandoBoletos(false);
    }
  }

  async function aplicarBoletos() {
    setSincronizandoBoletos(true);
    setErro(null);
    try {
      const r = await fetch("/api/dissidio/boletos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ano }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao marcar os boletos gerados.");
      setPreviaBoletos(null);
      setAviso(
        `${j.marcados} empresa(s) marcada(s) como gerado`
        + (j.jaEstava ? ` (${j.jaEstava} já estava(m)).` : ".")
        + (j.faltando
          ? ` ⚠️ ${j.faltando} não confirmada(s) no banco — clique em ⟳ Boletos e Marcar de novo.`
          : "")
      );
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao marcar os boletos gerados.");
    } finally {
      setSincronizandoBoletos(false);
    }
  }

  async function patch(corpo: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dissidio/${ano}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
      return true;
    } catch {
      setErro("Falha de rede ao salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarVersao() {
    setSalvando(true);
    setErro(null);
    setConflitos([]);
    try {
      const linhas = [...rascunhos.entries()].map(([cod, r]) => ({
        codigoempresa: cod,
        percentual: r.percentual,
        valor_novo: r.valor_novo,
        valor_base: empresas.find((e) => e.codigoempresa === cod)?.mensalidade?.total ?? null,
        observacao: r.observacao,
        blacklist: r.blacklist,
        blacklist_motivo: r.blacklist_motivo || null,
        responsavel: r.responsavel || null,
        grupo: r.grupo.trim() || null,
        definido: r.definido,
        gerado: r.gerado,
        visto_em: r.visto_em,
      }));

      const resp = await fetch(`/api/dissidio/${ano}/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentual_geral: percGeral, observacao: obsAno, empresas: linhas }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { setErro(j.error ?? "Não foi possível salvar."); return; }

      setConfirmar(false);
      setRascunhos(new Map());
      if (j.aviso) setErro(j.aviso);
      if (Array.isArray(j.conflitos) && j.conflitos.length > 0) setConflitos(j.conflitos);
      setAviso(
        `Versão salva — ${j.gravadas ?? 0} decisão(ões) individual(is)` +
        (j.derivadas ? ` e ${j.derivadas} empresa(s) pela regra geral.` : ".")
      );
      router.refresh();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const faixasAtivas = FAIXAS.filter((f) => percentuaisSel.includes(f.id));

    const lista = empresas
      .map((e) => {
        const st = estadoDe(e.codigoempresa);
        const base = e.mensalidade?.total ?? null;
        const aj = ajustes.get(e.codigoempresa);
        const mk = marcadores.get(e.codigoempresa);
        const virtual: Ajuste | undefined =
          st.percentual !== "" || st.valor_novo !== ""
            ? {
                ano, codigoempresa: e.codigoempresa,
                percentual: st.percentual === "" ? null : Number(st.percentual.replace(",", ".")),
                valor_novo: st.valor_novo === "" ? null : Number(st.valor_novo.replace(",", ".")),
                valor_base: base,
                origem: st.valor_novo !== "" ? "valor" : "percentual",
                observacao: st.observacao || null,
                analisado_por: aj?.analisado_por ?? meuEmail,
                analisado_em: aj?.analisado_em ?? "",
              }
            : undefined;
        return {
          e, st, base, aj: virtual, gravado: aj,
          grupo: st.grupo.trim() || null,
          sujo: rascunhos.has(e.codigoempresa),
          calc: calcular(base, percentualGeral, virtual),
        };
      })
      .filter(({ e, st, aj, base, grupo, calc }) => {
        if (soAtivas && e.codigocliente_ativo === false) return false;
        if (soBlacklist && !st.blacklist) return false;
        if (regimes.length > 0 && !regimes.includes(e.regime ?? "")) return false;
        if (atividadesSel.length > 0 && !atividadesSel.includes(e.atividade?.descricao ?? "")) return false;
        if (responsaveisSel.length > 0 && !responsaveisSel.includes(st.responsavel)) return false;
        if (gruposSel.length > 0 && !gruposSel.includes(grupo ?? "")) return false;
        if (faixasAtivas.length > 0 && !faixasAtivas.some((f) => f.testa(calc.percentual))) return false;
        // Conjuncao, ao contrario dos outros filtros: marcar Contabil e Fiscal
        // significa "quem tem os dois". Como quase toda empresa tem contabil,
        // a uniao nao recortaria nada util.
        if (servicosSel.length > 0 && !servicosSel.every((id) => valorServico(e, id) > 0)) return false;
        if (situacao === "ajustadas" && !aj) return false;
        if (situacao === "pendentes" && aj) return false;
        if (situacao === "sem_mensalidade" && base) return false;
        if (situacao === "ok" && !st.definido) return false;
        if (situacao === "falta_definir" && st.definido) return false;
        if (situacao === "gerado" && !st.gerado) return false;
        if (situacao === "nao_gerado" && st.gerado) return false;
        if (!q) return true;
        return (
          (e.nome ?? "").toLowerCase().includes(q) ||
          String(e.codigoempresa).includes(q) ||
          String(e.codigocliente ?? "").includes(q) ||
          (e.cnpj ?? "").includes(q) ||
          (grupo ?? "").toLowerCase().includes(q) ||
          (e.atividade?.descricao ?? "").toLowerCase().includes(q)
        );
      });

    const chave = (l: (typeof lista)[number]): number | string => {
      const y = anoDe(l.e, anoRecente);
      switch (ordenar) {
        case "mensalidade": return l.base ?? -1;
        case "faturamento": return y?.faturamento_media_mes ?? -1;
        case "empregados": return y?.empregados_media_mes ?? -1;
        case "horas": return y?.horas_media_mes ?? -1;
        case "diferenca": return l.calc.diferenca ?? -Infinity;
        case "percentual": return l.calc.percentual ?? -Infinity;
        case "valor_novo": return l.calc.valorNovo ?? -Infinity;
        case "responsavel": return RESPONSAVEL_NOME[l.st.responsavel] ?? "zzz";
        case "grupo": return (l.grupo ?? "zzz").toLowerCase();
        case "serv_dp": return valorServico(l.e, "dp");
        case "serv_contabil": return valorServico(l.e, "contabil");
        case "serv_fiscal": return valorServico(l.e, "fiscal");
        default: return (l.e.nome ?? "").toLowerCase();
      }
    };

    lista.sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      const r = typeof ka === "string" && typeof kb === "string"
        ? ka.localeCompare(kb, "pt-BR")
        : Number(ka) - Number(kb);
      return desc ? -r : r;
    });

    return lista;
  }, [empresas, estadoDe, rascunhos, ajustes, marcadores, percentualGeral, busca, situacao,
      regimes, atividadesSel, responsaveisSel, gruposSel, percentuaisSel, servicosSel, FAIXAS,
      soBlacklist, soAtivas, ordenar, desc, anoRecente, ano, meuEmail]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const totais = useMemo(() => {
    let atual = 0, novo = 0, comAjuste = 0, black = 0, ok = 0, gerados = 0;
    for (const l of filtradas) {
      if (l.st.blacklist) black++;
      if (l.st.definido) ok++;
      if (l.st.gerado) gerados++;
      if (l.base === null) continue;
      atual += l.base;
      novo += l.calc.valorNovo ?? l.base;
      if (l.aj) comAjuste++;
    }
    return { atual, novo, diferenca: novo - atual, comAjuste, black, ok, gerados,
             falta: filtradas.length - ok, naoGerados: filtradas.length - gerados };
  }, [filtradas]);

  function ordenarPor(col: Ordenar) {
    if (ordenar === col) setDesc(!desc);
    // Colunas de texto comecam em A→Z; as numericas, do maior para o menor —
    // que e o que se procura ao clicar em "Novo" ou "%".
    else { setOrdenar(col); setDesc(col !== "nome" && col !== "responsavel" && col !== "grupo"); }
  }
  /**
   * Indicador de ordenacao. Coluna inativa mostra a seta dupla apagada — sem
   * ela nao ha como saber que a coluna ordena antes de clicar nela.
   */
  const seta = (col: Ordenar) =>
    ordenar === col
      ? <span className="ord-on">{desc ? "↓" : "↑"}</span>
      : <span className="ord-off">⇅</span>;

  function exportar() {
    const cab = [
      "Cód. financeiro", "Cód. empresa", "Empresa", "CNPJ", "Grupo", "Atividade", "Regime", "Ativa",
      "Blacklist", "Responsável", "Definido (OK)", "Gerado (boleto/NF)",
      ...INDICADORES.filter((i) => i.id !== "reajuste")
        .flatMap((i) => anosComparados.map((a) => `${i.nome} ${a}`)),
      ...anosComparados.map((a) => `Reajuste aplicado ${a}`),
      "Mensalidade atual", "Percentual", "Valor novo", "Diferença", "Individual",
      ...SERVICOS.map((sv) => `Mensalidade ${sv.nome}`),
      "Observação", "Analisado por", "Analisado em",
    ];
    const linhasCsv = filtradas.map(({ e, st, gravado, base, calc, grupo }) => [
      e.codigocliente ?? "", e.codigoempresa, e.nome ?? "", formatCNPJ(e.cnpj), grupo ?? "",
      e.atividade?.descricao ?? "", e.regime ?? "",
      e.codigocliente_ativo === false ? "Não" : "Sim",
      st.blacklist ? "Sim" : "Não", RESPONSAVEL_NOME[st.responsavel] ?? "",
      st.definido ? "Sim" : "Não", st.gerado ? "Sim" : "Não",
      ...anosComparados.map((a) => anoDe(e, a)?.faturamento_media_mes ?? ""),
      ...anosComparados.map((a) => anoDe(e, a)?.empregados_media_mes ?? ""),
      ...anosComparados.map((a) => anoDe(e, a)?.horas_media_mes ?? ""),
      ...anosComparados.map((a) => mensalidadeDoAno(e, a) ?? ""),
      ...anosComparados.map((a) => reajusteDoAno(e, a) ?? ""),
      ...SERVICOS.map((sv) => valorServico(e, sv.id) || ""),
      base ?? "", calc.percentual ?? "", calc.valorNovo ?? "", calc.diferenca ?? "",
      calc.individual ? "Sim" : "Não", st.observacao,
      gravado?.analisado_por ?? "",
      gravado?.analisado_em ? formatDataHora(gravado.analisado_em) : "",
    ]);

    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const meta = [
      "Análise de Dissídio — Núcleo Contábil",
      `Rodada;${ano}`,
      `Percentual geral;${percentualGeral}%`,
      `Empresas listadas;${filtradas.length}`,
      `Definidas (OK);${totais.ok}   Faltam;${totais.falta}`,
      `Mensalidade atual (soma);${totais.atual.toFixed(2)}`,
      `Mensalidade nova (soma);${totais.novo.toFixed(2)}`,
      `Diferença;${totais.diferenca.toFixed(2)}`,
      `Observação do ano;${(obsAno || "-").replace(/[\r\n;]+/g, " ")}`,
      `Extraído em;${agoraFormatado()}`,
      "",
    ].join("\r\n");

    const corpo = [cab, ...linhasCsv].map((r) => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + meta + corpo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dissidio-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const colunas = 6 + INDICADORES.length * anosComparados.length + SERVICOS.length + 4;
  const temPendencia = pendentes > 0 || cabecalhoMudou;

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      {erro && <div className="banner error">{erro}</div>}

      {conflitos.length > 0 && (
        <div className="banner">
          <strong>{conflitos.length} empresa(s)</strong> foram alteradas por outra pessoa depois que
          você abriu a tela — o seu valor prevaleceu:{" "}
          {conflitos.map((c) => `#${c.codigoempresa} (${c.por ?? "?"})`).join(", ")}.
          <button className="btn" style={{ marginLeft: 8 }} onClick={() => setConflitos([])}>Ok</button>
        </div>
      )}

      {/* ---- barra compacta da rodada ---- */}
      <div className="barra-rodada">
        <label className="campo-inline">
          <span>Rodada</span>
          <select
            className="sel"
            value={ano}
            onChange={(e) => {
              if (temPendencia && !confirm("Há alterações não salvas. Trocar de ano vai descartá-las. Continuar?")) return;
              window.location.href = `/m/financeiro/dissidio?ano=${e.target.value}`;
            }}
          >
            {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        <label className="campo-inline">
          <span>% geral</span>
          <div className="com-sufixo">
            <input inputMode="decimal" value={percGeral} disabled={salvando}
                   onChange={(e) => setPercGeral(e.target.value)} />
            <em>%</em>
          </div>
        </label>

        <button className={`btn ${obsAno ? "on-obs" : ""}`} onClick={() => setObsAberta(true)}>
          Observação do ano{obsAno ? " •" : ""}
        </button>

        <div className="mini-totais">
          <span><em>Atual</em> R$ {formatBRL(totais.atual)}</span>
          <span><em>Nova</em> R$ {formatBRL(totais.novo)}</span>
          <span className={totais.diferenca < 0 ? "res-div" : "positivo"}>
            <em>Dif.</em> R$ {formatBRL(totais.diferenca)}
            {totais.atual > 0 && ` (${formatPct((totais.diferenca / totais.atual) * 100)})`}
          </span>
          <span><em>OK</em> {totais.ok}/{filtradas.length}</span>
        </div>

        <button className="btn primary" onClick={() => setConfirmar(true)} disabled={salvando || !temPendencia}>
          {salvando ? "Salvando…" : temPendencia ? `Salvar versão (${pendentes})` : "Tudo salvo"}
        </button>
        <a className="btn" href="/m/financeiro/dissidio/historico">Histórico</a>
        <button className="btn" onClick={verGrupos} disabled={sincronizando}
                title="Lê as pastas do SharePoint e casa pelo código da empresa">
          {sincronizando ? "Lendo…" : "⟳ Grupos"}
        </button>
        <button className="btn" onClick={verBoletos} disabled={sincronizandoBoletos}
                title="Lê a PLANILHA 2026 do financeiro (SharePoint) e marca o G de quem já teve o boleto gerado">
          {sincronizandoBoletos ? "Lendo…" : "⟳ Boletos"}
        </button>
        <button className="btn" onClick={exportar}>↓ Excel</button>
      </div>

      {/* ---- filtros ---- */}
      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, código, CNPJ ou grupo…"
               value={busca} onChange={(e) => setBusca(e.target.value)} />
        <CaixaSelecao rotulo="Grupo" opcoes={listaGrupos.map((g) => ({ id: g, nome: g }))}
                      selecionados={gruposSel} onMudar={setGruposSel} larga />
        <CaixaSelecao rotulo="Responsável" opcoes={RESPONSAVEIS.map((r) => ({ id: r.id, nome: r.nome }))}
                      selecionados={responsaveisSel} onMudar={setResponsaveisSel} />
        <CaixaSelecao rotulo="Reajuste" opcoes={FAIXAS.map((f) => ({ id: f.id, nome: f.nome }))}
                      selecionados={percentuaisSel} onMudar={setPercentuaisSel} />
        <CaixaSelecao rotulo="Tem serviço" opcoes={SERVICOS_FILTRO.map((x) => ({ id: x.id, nome: x.nome }))}
                      selecionados={servicosSel} onMudar={setServicosSel} />
        <CaixaSelecao rotulo="Regime" opcoes={listaRegimes.map((r) => ({ id: r, nome: r }))}
                      selecionados={regimes} onMudar={setRegimes} />
        <CaixaSelecao rotulo="Atividade" opcoes={listaAtividades.map((a) => ({ id: a, nome: a }))}
                      selecionados={atividadesSel} onMudar={setAtividadesSel} larga />
        <span className={`chip ${situacao === "falta_definir" ? "on" : ""}`}
              onClick={() => setSituacao(situacao === "falta_definir" ? "todas" : "falta_definir")}>
          Falta definir {totais.falta > 0 ? totais.falta : ""}
        </span>
        <span className={`chip ${situacao === "ok" ? "on" : ""}`}
              onClick={() => setSituacao(situacao === "ok" ? "todas" : "ok")}>OK</span>
        <span className={`chip ${situacao === "gerado" ? "on" : ""}`}
              title="Boleto e nota fiscal já gerados — linhas travadas"
              onClick={() => setSituacao(situacao === "gerado" ? "todas" : "gerado")}>
          Gerado {totais.gerados > 0 ? totais.gerados : ""}
        </span>
        <span className={`chip ${situacao === "nao_gerado" ? "on" : ""}`}
              title="Ainda faltam gerar boleto/NF (coluna G desmarcada)"
              onClick={() => setSituacao(situacao === "nao_gerado" ? "todas" : "nao_gerado")}>
          Não gerado {totais.naoGerados > 0 ? totais.naoGerados : ""}
        </span>
        <span className={`chip ${situacao === "ajustadas" ? "on" : ""}`}
              onClick={() => setSituacao(situacao === "ajustadas" ? "todas" : "ajustadas")}>Ajustadas</span>
        <span className={`chip ${soBlacklist ? "on" : ""}`} onClick={() => setSoBlacklist((v) => !v)}>Blacklist</span>
        <span className={`chip ${soAtivas ? "on" : ""}`} onClick={() => setSoAtivas((v) => !v)}>Só ativas</span>
        <span className="contador">{filtradas.length} de {empresas.length}</span>
      </div>

      {/* ---- tabela: indicador × ano ---- */}
      <TabelaComRolagemNoTopo>
        <table className="grid dissidio compacta">
          <thead>
            <tr>
              <th className="col-empresa" rowSpan={2}>
                <button className="th-ord" onClick={() => ordenarPor("nome")}>Empresa{seta("nome")}</button>
              </th>
              <th rowSpan={2} className="mini-col">
                <button className="th-ord" onClick={() => ordenarPor("responsavel")}>Resp.{seta("responsavel")}</button>
              </th>
              <th rowSpan={2} className="mini-col" title="Análise concluída nesta rodada">OK</th>
              <th rowSpan={2} className="mini-col g-col"
                  title="Boleto e nota fiscal gerados — trava a linha. Pode vir marcado sozinho pelo botão ⟳ Boletos ou ser marcado na mão.">G</th>
              {INDICADORES.map((ind) => (
                <th key={ind.id} className="ano" colSpan={anosComparados.length}>
                  {ind.ordena
                    ? <button className="th-ord" onClick={() => ordenarPor(ind.ordena!)}>{ind.nome}{seta(ind.ordena!)}</button>
                    : ind.nome}
                </th>
              ))}
              <th className="serv" colSpan={SERVICOS.length}>Mensalidade atual por serviço</th>
              <th className="sim" colSpan={4}>Simulação {ano}</th>
            </tr>
            <tr>
              {INDICADORES.map((ind) =>
                anosComparados.map((a) => (
                  <th key={`${ind.id}-${a}`} className="ano num sub-ano">{a}</th>
                ))
              )}
              {SERVICOS.map((sv) => (
                <th key={sv.id} className="serv num sub-ano">
                  <button className="th-ord" onClick={() => ordenarPor(sv.ordena)}>{sv.nome}{seta(sv.ordena)}</button>
                </th>
              ))}
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("mensalidade")}>Atual{seta("mensalidade")}</button>
              </th>
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("percentual")}>%{seta("percentual")}</button>
              </th>
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("valor_novo")}>Novo{seta("valor_novo")}</button>
              </th>
              <th className="sim num">
                <button className="th-ord" onClick={() => ordenarPor("diferenca")}>Dif.{seta("diferenca")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ e, st, base, calc, sujo, grupo }) => (
              <LinhaEmpresa
                key={e.codigoempresa}
                e={e} st={st} base={base} calc={calc} sujo={sujo} grupo={grupo}
                anos={anosComparados}
                salvando={salvando}
                onAbrir={() => setAberta(e.codigoempresa)}
                onEditar={(campos) => editar(e.codigoempresa, campos)}
              />
            ))}
            {visiveis.length === 0 && (
              <tr><td className="loading" colSpan={colunas}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </TabelaComRolagemNoTopo>

      {aberta !== null && (() => {
        const alvo = filtradas.find((l) => l.e.codigoempresa === aberta);
        if (!alvo) return null;
        return (
          <ModalEmpresa
            e={alvo.e} st={alvo.st} base={alvo.base} calc={alvo.calc} gravado={alvo.gravado}
            grupo={alvo.grupo} anos={anosDetalhe} grupos={listaGrupos}
            salvando={salvando}
            onFechar={() => setAberta(null)}
            onEditar={(campos) => editar(alvo.e.codigoempresa, campos)}
          />
        );
      })()}

      {totalPaginas > 1 && (
        <div className="paginacao">
          <button className="btn" onClick={() => setPagina(1)} disabled={paginaAtual === 1}>« Primeira</button>
          <button className="btn" onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 1}>‹ Anterior</button>
          <span className="pag-info">
            Página <strong>{paginaAtual}</strong> de {totalPaginas} ·{" "}
            {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, filtradas.length)} de {filtradas.length}
          </span>
          <button className="btn" onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual === totalPaginas}>Próxima ›</button>
          <button className="btn" onClick={() => setPagina(totalPaginas)} disabled={paginaAtual === totalPaginas}>Última »</button>
        </div>
      )}

      {previa && (
        <div className="modal-bg" onClick={() => setPrevia(null)}>
          <div className="modal estreito" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="tk-crumbs">SharePoint · /sites/Empresas</div>
                <h2>Sincronizar grupos econômicos</h2>
              </div>
              <button className="btn icon" onClick={() => setPrevia(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              <p className="nota">
                O grupo não existe no Questor — está na estrutura de pastas do SharePoint. Cada pasta
                dentro de um <strong>GRUPO X</strong> vira o grupo da empresa correspondente.
              </p>
              <div className="medicao">
                <div className="med destaque">
                  <div className="k">Pelo código</div>
                  <div className="v">{previa.casados.filter((c) => c.confianca === "codigo").length}</div>
                  <div className="ajuda">a pasta começa com o código da empresa</div>
                </div>
                <div className="med">
                  <div className="k">Nome idêntico</div>
                  <div className="v">{previa.casados.filter((c) => c.confianca === "exata").length}</div>
                </div>
                <div className="med">
                  <div className="k">Prováveis</div>
                  <div className="v">{previa.casados.filter((c) => c.confianca === "provavel").length}</div>
                  <div className="ajuda">só pelo começo do nome</div>
                </div>
                <div className="med">
                  <div className="k">Sem casar</div>
                  <div className="v">{previa.ambiguas.length + previa.pastasSemEmpresa.length}</div>
                  <div className="ajuda">de {previa.totalPastas ?? 0} pastas</div>
                </div>
              </div>

              {previa.casados.length > 0 && (
                <>
                  <h3>O que será gravado</h3>
                  <div className="table-wrap" style={{ maxHeight: 260 }}>
                    <table className="grid mini-perfil">
                      <thead>
                        <tr><th>Pasta</th><th>Empresa</th><th>Grupo</th><th>Casou por</th></tr>
                      </thead>
                      <tbody>
                        {previa.casados.slice(0, 300).map((c) => (
                          <tr key={`${c.codigoempresa}-${c.pasta}`}>
                            <td>{c.pasta}</td>
                            <td>{c.nome ?? `#${c.codigoempresa}`}</td>
                            <td>{c.grupo}</td>
                            <td>{c.confianca}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {previa.ambiguas.length > 0 && (
                <p className="nota">
                  {previa.ambiguas.length} pasta(s) batem com mais de uma empresa e ficam de fora —
                  casar errado colocaria a empresa no grupo do vizinho. Dá para definir o grupo dessas
                  na mão, no detalhe da empresa.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPrevia(null)}>Cancelar</button>
              <button className="btn" disabled={sincronizando} onClick={() => aplicarGrupos(true)}>
                Gravar incluindo os prováveis
              </button>
              <button className="btn primary" disabled={sincronizando} onClick={() => aplicarGrupos(false)}>
                {sincronizando ? "Gravando…" : "Gravar só os seguros"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previaBoletos && (
        <div className="modal-bg" onClick={() => setPreviaBoletos(null)}>
          <div className="modal estreito" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="tk-crumbs">SharePoint · /sites/Financeiro · PLANILHA 2026.xlsx</div>
                <h2>Sincronizar boletos gerados (G)</h2>
              </div>
              <button className="btn icon" onClick={() => setPreviaBoletos(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              <p className="nota">
                Casamento pelo <strong>código financeiro</strong> (coluna &quot;COD Q&quot; da planilha),
                nas abas <strong>Contabil</strong>, <strong>Digital</strong> e <strong>Negocios</strong> —
                conta quem está &quot;ok&quot; na coluna{" "}
                {previaBoletos.colunaStatus ? <strong>&quot;{previaBoletos.colunaStatus}&quot;</strong> : "do mês vigente"}.
              </p>
              <div className="medicao">
                <div className="med destaque">
                  <div className="k">Serão marcadas</div>
                  <div className="v">{previaBoletos.gerados.length}</div>
                  <div className="ajuda">empresa(s) com boleto já gerado, achadas pelo código</div>
                </div>
                <div className="med">
                  <div className="k">Sem empresa</div>
                  <div className="v">{previaBoletos.semEmpresa.length}</div>
                  <div className="ajuda">código da planilha não existe no Questor</div>
                </div>
                <div className="med">
                  <div className="k">Ambíguos</div>
                  <div className="v">{previaBoletos.ambiguos.length}</div>
                  <div className="ajuda">código financeiro em mais de uma empresa</div>
                </div>
                <div className="med">
                  <div className="k">Linhas lidas</div>
                  <div className="v">{previaBoletos.totalLinhas}</div>
                </div>
              </div>

              {previaBoletos.abasComErro.length > 0 && (
                <p className="nota" style={{ color: "var(--res-div, #b00)" }}>
                  Não consegui ler {previaBoletos.abasComErro.length} aba(s):{" "}
                  {previaBoletos.abasComErro.map((a) => `${a.aba} (${a.erro})`).join("; ")}
                </p>
              )}

              {previaBoletos.gerados.length > 0 && (
                <>
                  <h3>O que será marcado</h3>
                  <div className="table-wrap" style={{ maxHeight: 260 }}>
                    <table className="grid mini-perfil">
                      <thead>
                        <tr><th>Cód. financeiro</th><th>Empresa</th><th>Aba</th></tr>
                      </thead>
                      <tbody>
                        {previaBoletos.gerados.slice(0, 300).map((c) => (
                          <tr key={c.codigoempresa}>
                            <td>{c.codigocliente}</td>
                            <td>{c.empresa ?? `#${c.codigoempresa}`}</td>
                            <td>{c.aba}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {previaBoletos.ambiguos.length > 0 && (
                <p className="nota">
                  {previaBoletos.ambiguos.length} código(s) financeiro(s) pertencem a mais de uma
                  empresa (matriz/filial, por exemplo) e ficam de fora — dá pra marcar o G na mão,
                  na linha de cada uma.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPreviaBoletos(null)}>Cancelar</button>
              <button className="btn primary" disabled={sincronizandoBoletos || previaBoletos.gerados.length === 0}
                      onClick={aplicarBoletos}>
                {sincronizandoBoletos ? "Gravando…" : `Marcar ${previaBoletos.gerados.length} empresa(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {obsAberta && (
        <div className="modal-bg" onClick={() => setObsAberta(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ width: "min(620px, 100%)" }}>
            <div className="modal-head">
              <h2>Observação do ano — {ano}</h2>
              <button className="btn icon" onClick={() => setObsAberta(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              <textarea rows={6} value={obsAno} disabled={salvando} style={{ width: "100%" }}
                        onChange={(e) => setObsAno(e.target.value)}
                        placeholder="Ex.: convenção coletiva 2026, reajuste de 4,5% sobre a data-base de janeiro." />
              <p className="nota">Salva junto com a versão.</p>
            </div>
            <div className="modal-foot">
              <button className="btn primary" onClick={() => setObsAberta(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="modal-bg" onClick={() => setConfirmar(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-head">
              <h2>Salvar versão de {ano}</h2>
              <button className="btn icon" onClick={() => setConfirmar(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              <p>
                Serão gravadas as <strong>{pendentes} empresa(s)</strong> que você alterou
                {cabecalhoMudou && <>, mais o <strong>percentual geral</strong> e a observação do ano</>}.
              </p>
              <p>
                Em seguida o sistema completa o retrato: <strong>todas as demais empresas</strong>{" "}
                recebem uma linha com o percentual geral aplicado, para o histórico ficar auditável.
              </p>
              <p className="nota">
                Decisões individuais de outra pessoa <strong>não são sobrescritas</strong>.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmar(false)} disabled={salvando}>Cancelar</button>{" "}
              <button className="btn primary" onClick={salvarVersao} disabled={salvando}>
                {salvando ? "Salvando…" : "Confirmar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && <div className="toast">{aviso}</div>}

      <p className="footnote">
        Cada bloco é um <strong>indicador</strong>, com os anos dentro. Faturamento, empregados e
        horas são médias mensais do ano; a mensalidade é a vigente no fim de cada ano;{" "}
        <strong>Reajuste aplicado</strong> vem das rodadas anteriores registradas aqui.
        <strong> Atividade</strong> e <strong>Regime</strong> saíram da tabela para ganhar largura —
        continuam disponíveis como filtro.
      </p>
    </>
  );
}
/* ---------------------------------------------------------------- filtro */

function CaixaSelecao({
  rotulo, opcoes, selecionados, onMudar, larga,
}: {
  rotulo: string;
  opcoes: { id: string; nome: string }[];
  selecionados: string[];
  onMudar: (v: string[]) => void;
  larga?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(ev.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const visiveis = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? opcoes.filter((o) => o.nome.toLowerCase().includes(q)) : opcoes;
  }, [opcoes, filtro]);

  function alternar(id: string) {
    onMudar(selecionados.includes(id)
      ? selecionados.filter((x) => x !== id)
      : [...selecionados, id]);
  }

  const resumo = selecionados.length === 0
    ? rotulo
    : selecionados.length === 1
      ? (opcoes.find((o) => o.id === selecionados[0])?.nome ?? rotulo)
      : `${rotulo}: ${selecionados.length}`;

  return (
    <div className="multi" ref={caixa}>
      <button
        className={`chip ${selecionados.length > 0 ? "on" : ""}`}
        onClick={() => setAberto((v) => !v)}
      >
        {resumo} ▾
      </button>
      {aberto && (
        <div className={`multi-lista ${larga ? "larga" : ""}`}>
          {opcoes.length > 8 && (
            <input
              className="multi-busca"
              placeholder="Filtrar…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              autoFocus
            />
          )}
          <div className="multi-itens">
            {visiveis.map((o) => (
              <label key={o.id} className="multi-item">
                <input
                  type="checkbox"
                  checked={selecionados.includes(o.id)}
                  onChange={() => alternar(o.id)}
                />
                <span>{o.nome}</span>
              </label>
            ))}
            {visiveis.length === 0 && <div className="multi-vazio">Nada encontrado.</div>}
          </div>
          {selecionados.length > 0 && (
            <button className="multi-limpar" onClick={() => onMudar([])}>Limpar seleção</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------- tabela com rolagem no topo */

/**
 * Espelha a barra de rolagem horizontal acima da tabela: numa tabela larga,
 * a barra de baixo fica fora da tela e ninguém a encontra.
 */
function TabelaComRolagemNoTopo({ children }: { children: React.ReactNode }) {
  const topo = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => setLargura(el.scrollWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const sincronizar = (de: HTMLDivElement | null, para: HTMLDivElement | null) => () => {
    if (de && para && para.scrollLeft !== de.scrollLeft) para.scrollLeft = de.scrollLeft;
  };

  return (
    <>
      <div className="rolagem-topo" ref={topo} onScroll={sincronizar(topo.current, corpo.current)}>
        <div style={{ width: largura, height: 1 }} />
      </div>
      <div className="table-wrap fixa" ref={corpo} onScroll={sincronizar(corpo.current, topo.current)}>
        {children}
      </div>
    </>
  );
}


/* ---------------------------------------------------------------- linha */

function LinhaEmpresa({
  e, st, base, calc, sujo, grupo, anos, salvando, onAbrir, onEditar,
}: {
  e: PerfilEmpresa;
  st: Rascunho;
  base: number | null;
  calc: ReturnType<typeof calcular>;
  sujo: boolean;
  grupo: string | null;
  anos: number[];
  salvando: boolean;
  onAbrir: () => void;
  onEditar: (campos: Partial<Rascunho>) => void;
}) {
  /** Uma célula por indicador/ano. */
  const celula = (ind: string, a: number) => {
    const y = anoDe(e, a);
    const parcial = y && y.meses_considerados < 12;
    let conteudo: string = "—";

    if (ind === "faturamento") conteudo = y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—";
    else if (ind === "empregados") conteudo = formatNum(y?.empregados_media_mes ?? null);
    else if (ind === "horas") conteudo = formatNum(y?.horas_media_mes ?? null);
    else if (ind === "mensalidade") {
      const v = mensalidadeDoAno(e, a);
      conteudo = v !== null ? formatBRL(v) : "—";
    } else if (ind === "reajuste") {
      const p = reajusteDoAno(e, a);
      conteudo = p === null ? "—" : formatPct(p);
    }

    return (
      <td key={`${ind}-${a}`} className={`ano num ${ind === "reajuste" ? "reaj" : ""}`}
          title={parcial && ind !== "reajuste" ? `${y?.meses_considerados} meses fechados` : undefined}>
        {conteudo}
        {parcial && ind === "faturamento" && <span className="parcial">*</span>}
      </td>
    );
  };

  return (
    <tr className={`${calc.individual ? "tem-ajuste" : ""} ${sujo ? "nao-salvo" : ""} ${st.definido ? "definida" : ""} ${st.gerado ? "faturada" : ""}`}>
      <td className="col-empresa">
        <button className="link-empresa" onClick={onAbrir} title="Abrir detalhes">
          {e.nome ?? `Empresa #${e.codigoempresa}`}
        </button>
        <span className="cnpj">
          <span className="codigo">fin. {e.codigocliente ?? "—"}</span>
          {" · "}emp. {e.codigoempresa}
          {grupo && <span className="tag-grupo-linha">{grupo}</span>}
          {st.blacklist && <span className="tag-black" title={st.blacklist_motivo || "cliente complexo"}>BL</span>}
          {e.codigocliente_ativo === false && <span className="tag-inativa">inativa</span>}
          {sujo && <span className="tag-nao-salvo" title="alteração ainda não salva">•</span>}
        </span>
      </td>

      <td className="mini-col">
        <select className="mini-sel" value={st.responsavel} disabled={salvando || st.gerado}
                onChange={(ev) => onEditar({ responsavel: ev.target.value })}>
          <option value="">—</option>
          {RESPONSAVEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </td>

      <td className="mini-col num">
        <input type="checkbox" checked={st.definido} disabled={salvando || st.gerado}
               title="Análise concluída nesta rodada"
               onChange={(ev) => onEditar({ definido: ev.target.checked })} />
      </td>

      <td className="mini-col num g-col">
        <input type="checkbox" checked={st.gerado} disabled={salvando}
               title={st.gerado
                 ? "Boleto e NF gerados — desmarque para poder editar de novo"
                 : "Marcar como boleto e NF gerados (trava a linha). O botão ⟳ Boletos marca isso sozinho, pela planilha do financeiro."}
               onChange={(ev) => onEditar({ gerado: ev.target.checked })} />
      </td>

      {INDICADORES.map((ind) => anos.map((a) => celula(ind.id, a)))}

      {SERVICOS.map((sv) => {
        const v = valorServico(e, sv.id);
        return (
          <td key={sv.id} className="serv num" title={v > 0 ? `${sv.nome} contratado` : `Sem ${sv.nome}`}>
            {v > 0 ? formatBRL(v) : <span className="sem-serv">—</span>}
          </td>
        );
      })}

      <td className="sim num">{base === null ? "—" : formatBRL(base)}</td>
      <td className="sim">
        <input className="mini" inputMode="decimal" value={st.percentual} disabled={salvando || st.gerado}
               placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
               onChange={(ev) => onEditar({ percentual: ev.target.value, valor_novo: "" })} />
      </td>
      <td className="sim">
        <input className="mini" inputMode="decimal" value={st.valor_novo} disabled={salvando || st.gerado}
               placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
               onChange={(ev) => onEditar({ valor_novo: ev.target.value, percentual: "" })} />
      </td>
      <td className={`sim num ${(calc.diferenca ?? 0) < 0 ? "res-div" : ""}`}>
        {calc.diferenca === null ? "—" : formatBRL(calc.diferenca)}
      </td>
    </tr>
  );
}
/* ------------------------------------------------------- modal da empresa */

function ModalEmpresa({
  e, st, base, calc, gravado, grupo, anos, grupos, salvando, onFechar, onEditar,
}: {
  e: PerfilEmpresa;
  st: Rascunho;
  base: number | null;
  calc: ReturnType<typeof calcular>;
  gravado: Ajuste | undefined;
  grupo: string | null;
  anos: number[];
  grupos: string[];
  salvando: boolean;
  onFechar: () => void;
  onEditar: (campos: Partial<Rascunho>) => void;
}) {
  const [servicos, setServicos] = useState<PerfilServico[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (servicos !== null || buscando) return;
    setBuscando(true);
    fetch(`/api/dissidio/empresa/${e.codigoempresa}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setServicos(j.servicos ?? []))
      .catch(() => setServicos([]))
      .finally(() => setBuscando(false));
  }, [servicos, buscando, e.codigoempresa]);

  // Fecha com Esc, como qualquer diálogo.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") onFechar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
  <div className="modal-bg" onClick={onFechar}>
        <div className="modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="tk-crumbs">
                fin. {e.codigocliente ?? "—"} · emp. {e.codigoempresa}
                {e.cnpj ? ` · ${formatCNPJ(e.cnpj)}` : ""}
              </div>
              <h2>{e.nome ?? `Empresa #${e.codigoempresa}`}</h2>
            </div>
            <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
            <datalist id="lista-grupos">
              {grupos.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>

          <div className="modal-body">
            <div className="medicao">
              <div className="med">
                <div className="k">Mensalidade atual</div>
                <div className="v">{base === null ? "—" : `R$ ${formatBRL(base)}`}</div>
              </div>
              <div className="med">
                <div className="k">Percentual</div>
                <div className="v">{formatPct(calc.percentual)}</div>
                <div className="ajuda">{calc.individual ? "ajuste desta empresa" : "percentual geral"}</div>
              </div>
              <div className="med destaque">
                <div className="k">Valor novo</div>
                <div className="v">{calc.valorNovo === null ? "—" : `R$ ${formatBRL(calc.valorNovo)}`}</div>
                <div className="ajuda">
                  {calc.diferenca === null ? "" : `diferença de R$ ${formatBRL(calc.diferenca)}`}
                </div>
              </div>
            </div>

            {st.gerado && (
              <p className="aviso-travado">
                Boleto e nota fiscal já gerados. Os valores estão travados para não
                divergirem do que foi cobrado — desmarque o <strong>G</strong> na linha
                para poder editar.
              </p>
            )}

            <h3>Ajuste desta empresa</h3>
            <div className="form-linha">
              <label className="campo-inline">
                <span>Percentual (%)</span>
                <input
                  inputMode="decimal" value={st.percentual} disabled={salvando || st.gerado}
                  placeholder={calc.individual ? "" : String(calc.percentual ?? "")}
                  onChange={(ev) => onEditar({ percentual: ev.target.value, valor_novo: "" })}
                />
              </label>
              <label className="campo-inline">
                <span>ou valor novo (R$)</span>
                <input
                  inputMode="decimal" value={st.valor_novo} disabled={salvando || st.gerado}
                  placeholder={calc.valorNovo !== null ? formatBRL(calc.valorNovo) : ""}
                  onChange={(ev) => onEditar({ valor_novo: ev.target.value, percentual: "" })}
                />
              </label>
              <label className="campo-inline">
                <span>Responsável pela validação</span>
                <select
                  className="sel" value={st.responsavel} disabled={salvando || st.gerado}
                  onChange={(ev) => onEditar({ responsavel: ev.target.value })}
                >
                  <option value="">Sem responsável</option>
                  {RESPONSAVEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </label>
            </div>
            <p className="nota">
              Preencha percentual <em>ou</em> valor — o outro é calculado. Em branco, a empresa segue
              o percentual geral da rodada.
            </p>

            <h3>Grupo econômico</h3>
            <label className="campo-inline larga">
              <span>Grupo</span>
              <input
                list="lista-grupos" value={st.grupo} disabled={salvando}
                onChange={(ev) => onEditar({ grupo: ev.target.value })}
                placeholder="Ex.: GRUPO LBF — em branco, a empresa fica sem grupo."
              />
            </label>
            <p className="nota">
              Pertence à <strong>empresa</strong>, não à rodada. A sincronização com as pastas do
              SharePoint preenche este campo automaticamente; aqui dá para corrigir ou criar um grupo
              que ainda não existe lá.
            </p>

            <h3>Cliente complexo (blacklist)</h3>
            <label className="check-linha">
              <input
                type="checkbox" checked={st.blacklist} disabled={salvando}
                onChange={(ev) => onEditar({ blacklist: ev.target.checked })}
              />
              <span>Marcar como cliente problemático ou complexo</span>
            </label>
            {st.blacklist && (
              <label className="campo-inline larga" style={{ marginTop: 8 }}>
                <span>Motivo</span>
                <input
                  value={st.blacklist_motivo} disabled={salvando}
                  onChange={(ev) => onEditar({ blacklist_motivo: ev.target.value })}
                  placeholder="Ex.: envia documentação sempre fora do prazo."
                />
              </label>
            )}
            <p className="nota">
              Esta marca pertence à <strong>empresa</strong>, não à rodada — vale para os próximos anos.
            </p>

            <h3>Observação desta empresa</h3>
            <textarea
              rows={3} value={st.observacao} disabled={salvando} style={{ width: "100%" }}
              onChange={(ev) => onEditar({ observacao: ev.target.value })}
              placeholder="Ex.: cliente em negociação, reajuste escalonado a partir de julho."
            />

            {gravado && (
              <p className="nota" style={{ marginTop: 10 }}>
                Última gravação por <strong>{gravado.analisado_por ?? "—"}</strong>
                {gravado.analisado_em && ` em ${formatDataHora(gravado.analisado_em)}`}.
                {gravado.valor_base !== null && <> Base congelada: R$ {formatBRL(gravado.valor_base)}.</>}
              </p>
            )}

            <h3>Perfil por ano</h3>
            <div className="table-wrap">
              <table className="grid mini-perfil">
                <thead>
                  <tr>
                    <th>Ano</th>
                    <th className="num">Faturam./mês</th>
                    <th className="num">Empregados</th>
                    <th className="num">Horas/mês</th>
                    <th className="num">Mensalidade</th>
                    <th className="num">Reajuste</th>
                  </tr>
                </thead>
                <tbody>
                  {anos.map((a) => {
                    const y = anoDe(e, a);
                    const parcial = y && y.meses_considerados < 12;
                    return (
                      <tr key={a}>
                        <td>
                          {a}
                          {parcial && <span className="parcial" title={`${y?.meses_considerados} meses`}>*</span>}
                        </td>
                        <td className="num">{y?.faturamento_media_mes ? formatBRL(y.faturamento_media_mes) : "—"}</td>
                        <td className="num">{formatNum(y?.empregados_media_mes ?? null)}</td>
                        <td className="num">{formatNum(y?.horas_media_mes ?? null)}</td>
                        <td className="num"
                            title={a === new Date().getFullYear() ? "Honorário vigente hoje" : `Vigente em 31/12/${a}`}>
                          {mensalidadeDoAno(e, a) !== null ? formatBRL(mensalidadeDoAno(e, a)) : "—"}
                        </td>
                        <td className="num reaj" title="Variação sobre a mensalidade do ano anterior">
                          {reajusteDoAno(e, a) === null ? "—" : formatPct(reajusteDoAno(e, a))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3>Serviços contratados</h3>
            {buscando && <p className="nota">Carregando…</p>}
            {servicos !== null && servicos.length === 0 && <p className="nota">Nenhum serviço vigente.</p>}
            {servicos !== null && servicos.length > 0 && (
              <div className="servicos-lista">
                {servicos.map((s) => (
                  <span key={s.servico} className="servico-item">
                    {s.descricao ?? `#${s.servico}`}
                    {s.valor ? <em> R$ {formatBRL(s.valor)}</em> : null}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="modal-foot">
            {calc.individual && (
              <button
                className="btn"
                disabled={salvando}
                onClick={() => onEditar({ percentual: "", valor_novo: "" })}
              >
                Voltar ao percentual geral
              </button>
            )}{" "}
            <button className="btn primary" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
  );
}
