"use client";

// Interface do Robô Zen — porta da UI do app Flask original (3 seções:
// rodar simulação completa + envio em lote, consultar uma empresa +
// enviar de verdade, e um resultado exportável em CSV no lugar da antiga
// seção "Relatórios", que listava planilhas geradas no disco local: não
// existe disco persistente entre invocações serverless, então o resultado
// vira só uma tabela na tela com botão de exportar CSV).
//
// Cada uma das duas operações "de longa duração" (simulação completa e
// envio real em lote) é um job incremental no servidor (ver
// lib/robo-zen/job-simulacao.ts e job-lote-envio.ts): este componente só
// chama repetidamente o endpoint .../continuar (polling a cada ~1500ms,
// mesma cadência do app original) até a resposta trazer `concluida: true`.
// Se a pessoa fechar a aba, o job fica parado onde estava — ao abrir a tela de
// novo, a simulação em status "mapeando"/"processando" e o envio em lote
// "processando" são retomados do ponto onde pararam (ver useEffect de montagem).
// O estado de ambos fica no banco; vários navegadores podem empurrar o mesmo lote
// (o servidor roda um passo por vez).
//
// Os tipos abaixo espelham as respostas das rotas de API em
// app/api/paralegal/robo-zen/** — definidos aqui (e não importados de
// lib/robo-zen/*) porque aqueles arquivos puxam código só-de-servidor
// (credenciais do Microsoft Graph, chave de serviço do Supabase) que não
// deve entrar no bundle do cliente.

import { useEffect, useMemo, useRef, useState } from "react";
import { TAMANHOS_PAGINA, chaveMotivo, filtrarResultados, paginar } from "@/lib/robo-zen/resultado-lista";

import { MOTIVO_JA_ENVIADA_ALTERADA, MOTIVO_PRONTA_DOC_NOVO } from "@/lib/robo-zen/novidades-envio";
import { MOTIVO_ENVIADA, MOTIVO_ENVIO_INTERROMPIDO, MOTIVO_ENVIO_PARCIAL } from "@/lib/robo-zen/situacao-envio";

type StatusSimulacao = "mapeando" | "processando" | "concluida" | "erro" | "parada";
type StatusLoteEnvio = "processando" | "concluida" | "erro" | "parada";

interface EstadoSimulacao {
  id: string;
  status: StatusSimulacao;
  pastasMapeadas: number;
  totalPastas: number;
  totalEmpresas: number;
  empresasProcessadas: number;
  empresasProntas: number;
  empresaAtual: string | null;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  erro: string | null;
  pararPedido: boolean;
  concluida: boolean;
}

interface EstadoLoteEnvio {
  id: string;
  status: StatusLoteEnvio;
  simulacaoOrigemId: string;
  totalEmpresasProntas: number;
  empresasProcessadas: number;
  empresasEnviadas: number;
  empresasJaEnviadas: number;
  documentosEnviados: number;
  documentosComErro: number;
  erros: string[];
  empresaAtual: string | null;
  iniciadoEm: string;
  terminadoEm: string | null;
  erro: string | null;
  pararPedido: boolean;
  concluida: boolean;
  /** Falhas passageiras seguidas (SharePoint/Zen/banco) — 0 quando está tudo bem. */
  falhasSeguidas: number;
  iniciadoPor: string;
}

interface LinhaResultado {
  codigo: string;
  empresa: string;
  qtdDocumentosElegiveis: number;
  documentosElegiveis: string;
  /** Mesma ordem do que o servidor guardou — a posição é o `doc=` do download. */
  documentos: string[];
  qtdDocumentosEscaneados: number;
  documentosEscaneados: string;
  qtdDocumentosIgnorados: number;
  documentosIgnorados: string;
  cnpj: string;
  status: string;
  motivo: string;
  pronta: boolean;
}

interface ResultadoSimulacao {
  resultados: LinhaResultado[];
  resumo: Record<string, number>;
  /** false = o registro de envios não pôde ser lido agora: o "Pronta" pode estar desatualizado. */
  situacaoDeEnvioConferida?: boolean;
}

interface ResultadoConsultaEmpresa {
  codigo: string;
  empresa: string;
  qtdDocumentosElegiveis: number;
  qtdDocumentosEscaneados: number;
  qtdDocumentosIgnorados: number;
  cnpj: string;
  status: string;
  motivo: string;
  pronta: boolean;
}

interface EnvioPendente {
  token: string;
  empresa: string;
  codigo: string;
  cnpj: string;
  documentos: string[];
  /** Já enviados antes — não vão de novo. */
  jaEnviados: string[];
}

interface ResultadoEnvio {
  empresa: string;
  cnpj: string;
  documentos: { arquivo: string; documentoId: string }[];
}

const INTERVALO_POLL_MS = 1500;

/** Se uma chamada do envio em lote falhar (rede caiu, servidor piscou), a tela tenta
 * de novo antes de desistir — o lote está salvo no banco e cada passo é seguro de
 * repetir (o servidor trava um passo por vez e confere o registro de envios). */
const TENTATIVAS_REDE_LOTE = 8;
const ESPERA_REDE_LOTE_MS = 5000;

async function chamarApi<T extends object>(url: string, opcoes?: RequestInit): Promise<T & { ok: boolean; erro?: string }> {
  try {
    const r = await fetch(url, {
      ...opcoes,
      headers: { "Content-Type": "application/json", ...(opcoes?.headers ?? {}) },
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, erro: `Resposta inválida do servidor (HTTP ${r.status}).` } as T & { ok: boolean; erro?: string };
    return j;
  } catch {
    return { ok: false, erro: "Falha de rede ao chamar o servidor." } as T & { ok: boolean; erro?: string };
  }
}

function formatarData(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [cabecalho, ...linhas].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RoboZen({ userEmail: _userEmail }: { userEmail: string }) {
  // ---------------- Seção 1: rodar simulação completa ----------------
  const [simulacao, setSimulacao] = useState<EstadoSimulacao | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);
  const [carregandoResultado, setCarregandoResultado] = useState(false);
  // Tabela de resultado: busca, filtro por motivo e paginação (só na tela — o
  // CSV continua levando todas as empresas).
  const [buscaResultado, setBuscaResultado] = useState("");
  const [filtroMotivo, setFiltroMotivo] = useState("");
  const [porPagina, setPorPagina] = useState<number>(TAMANHOS_PAGINA[0]);
  const [paginaResultado, setPaginaResultado] = useState(1);
  const topoResultadoRef = useRef<HTMLDivElement | null>(null);
  const [baixandoContrato, setBaixandoContrato] = useState<string | null>(null);
  const [erroDownload, setErroDownload] = useState<string | null>(null);
  const timerSimulacaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Danger zone: envio real em lote (todas as empresas prontas da simulação acima).
  const [checkLote, setCheckLote] = useState(false);
  const [lote, setLote] = useState<EstadoLoteEnvio | null>(null);
  const [loteRodando, setLoteRodando] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [avisoRedeLote, setAvisoRedeLote] = useState<string | null>(null);
  const timerLoteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------- Seção 2: consultar uma empresa específica ----------------
  const [busca, setBusca] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [consulta, setConsulta] = useState<{ origem: "simulacao" | "ao_vivo"; resultado: ResultadoConsultaEmpresa } | null>(null);
  const [erroConsulta, setErroConsulta] = useState<string | null>(null);

  const [preparando, setPreparando] = useState(false);
  const [pendente, setPendente] = useState<EnvioPendente | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<ResultadoEnvio | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const linhasFiltradas = useMemo(
    () => (resultado ? filtrarResultados(resultado.resultados, buscaResultado, filtroMotivo) : []),
    [resultado, buscaResultado, filtroMotivo]
  );
  const pg = paginar(linhasFiltradas, paginaResultado, porPagina);

  /** `rolar`: a barra de baixo leva o topo da tabela de volta à vista (senão a pessoa
   * clica em "Próxima" lá embaixo e fica no fim da página nova). */
  function irParaPagina(n: number, rolar = false) {
    setPaginaResultado(n);
    if (rolar) topoResultadoRef.current?.scrollIntoView({ block: "start" });
  }

  function barraPaginas(rolar: boolean) {
    if (pg.totalPaginas <= 1) return null;
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap", margin: "10px 0", fontSize: 13 }}>
        <button className="btn" onClick={() => irParaPagina(1, rolar)} disabled={pg.pagina === 1} title="Primeira página">«</button>
        <button className="btn" onClick={() => irParaPagina(pg.pagina - 1, rolar)} disabled={pg.pagina === 1}>‹ Anterior</button>
        <span>Página {pg.pagina} de {pg.totalPaginas} · {pg.de}–{pg.ate} de {pg.total}</span>
        <button className="btn" onClick={() => irParaPagina(pg.pagina + 1, rolar)} disabled={pg.pagina === pg.totalPaginas}>Próxima ›</button>
        <button className="btn" onClick={() => irParaPagina(pg.totalPaginas, rolar)} disabled={pg.pagina === pg.totalPaginas} title="Última página">»</button>
      </div>
    );
  }

  async function baixarContrato(codigo: string, indice: number) {
    if (!simulacao) return;
    setErroDownload(null);
    setBaixandoContrato(`${codigo}:${indice}`);
    const j = await chamarApi<{ nome: string; url: string }>(
      `/api/paralegal/robo-zen/simulacoes/${simulacao.id}/contrato?codigo=${encodeURIComponent(codigo)}&doc=${indice}`
    );
    setBaixandoContrato(null);
    if (!j.ok || !j.url) {
      setErroDownload(j.erro ?? "Não foi possível baixar o contrato.");
      return;
    }
    // O link é do próprio SharePoint e já vem como anexo (download), então a
    // página não sai do lugar — só dispara o clique num <a> temporário.
    const a = document.createElement("a");
    a.href = j.url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function carregarResultado(id: string) {
    setCarregandoResultado(true);
    const j = await chamarApi<ResultadoSimulacao>(`/api/paralegal/robo-zen/simulacoes/${id}/resultado`);
    if (j.ok) {
      setResultado({ resultados: j.resultados, resumo: j.resumo, situacaoDeEnvioConferida: j.situacaoDeEnvioConferida });
      setBuscaResultado("");
      setFiltroMotivo("");
      setPaginaResultado(1);
    }
    setCarregandoResultado(false);
  }

  function avancarSimulacao(id: string) {
    timerSimulacaoRef.current = setTimeout(async () => {
      const j = await chamarApi<{ simulacao: EstadoSimulacao }>(`/api/paralegal/robo-zen/simulacoes/${id}/continuar`, { method: "POST" });
      if (!j.ok || !j.simulacao) {
        setErroSimulacao(j.erro ?? "Falha ao avançar a simulação.");
        setSimulando(false);
        return;
      }
      setSimulacao(j.simulacao);
      if (j.simulacao.concluida) {
        setSimulando(false);
        if (j.simulacao.status === "erro" && j.simulacao.erro) setErroSimulacao(j.simulacao.erro);
        if (j.simulacao.status === "concluida") void carregarResultado(id);
      } else {
        avancarSimulacao(id);
      }
    }, INTERVALO_POLL_MS);
  }

  function avancarLote(id: string, falhasDeRede = 0) {
    timerLoteRef.current = setTimeout(
      async () => {
        const j = await chamarApi<{ lote: EstadoLoteEnvio }>(`/api/paralegal/robo-zen/lotes-envio/${id}/continuar`, { method: "POST" });
        if (!j.ok || !j.lote) {
          // A rede caiu ou o servidor falhou. O lote está salvo no banco (e o que já foi
          // enviado está no registro), então tenta de novo em vez de largar o envio no meio.
          const n = falhasDeRede + 1;
          const naoExiste = /não encontrado/i.test(j.erro ?? "");
          if (!naoExiste && n < TENTATIVAS_REDE_LOTE) {
            setAvisoRedeLote(`Sem resposta do servidor (${j.erro ?? "falha"}) — tentando de novo (${n} de ${TENTATIVAS_REDE_LOTE - 1})…`);
            avancarLote(id, n);
            return;
          }
          setAvisoRedeLote(null);
          setErroLote(
            (j.erro ?? "Falha ao avançar o envio em lote.") +
              " O envio ficou salvo no ponto onde parou — use “Continuar o envio” quando a conexão voltar."
          );
          setLoteRodando(false);
          return;
        }
        setAvisoRedeLote(null);
        setLote(j.lote);
        if (j.lote.concluida) {
          setLoteRodando(false);
          if (j.lote.status === "erro" && j.lote.erro) setErroLote(j.lote.erro);
          // O que foi enviado muda a situação das linhas ("Enviada"): recarrega a tabela.
          void carregarResultado(j.lote.simulacaoOrigemId);
        } else {
          avancarLote(id);
        }
      },
      falhasDeRede > 0 ? ESPERA_REDE_LOTE_MS : INTERVALO_POLL_MS
    );
  }

  function retomarLote() {
    if (!lote || lote.concluida) return;
    setErroLote(null);
    setLoteRodando(true);
    avancarLote(lote.id);
  }

  // Ao abrir a tela: retoma o polling se já tinha uma simulação rodando
  // (ex.: a pessoa deu refresh, ou outra pessoa do setor deixou rodando).
  // Sem isso, e sem uma simulação ativa, mostra a última concluída (se
  // houver) — assim a "zona de perigo" do envio em lote continua utilizável
  // mesmo depois de fechar e reabrir a aba.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      // Envio em lote que ficou no meio (aba fechada, rede que caiu, outra pessoa do
      // setor): reencontra e continua de onde parou. Sem isso o lote ficava parado e o
      // botão respondia "Já tem um envio em lote rodando".
      const loteResp = await chamarApi<{ ativo: EstadoLoteEnvio | null }>("/api/paralegal/robo-zen/lotes-envio?ativo=1");
      if (cancelado) return;
      if (loteResp.ok && loteResp.ativo) {
        setLote(loteResp.ativo);
        setLoteRodando(true);
        avancarLote(loteResp.ativo.id);
      }

      const ativaResp = await chamarApi<{ ativa: EstadoSimulacao | null }>("/api/paralegal/robo-zen/simulacoes?ativa=1");
      if (cancelado) return;
      if (ativaResp.ok && ativaResp.ativa) {
        setSimulacao(ativaResp.ativa);
        setSimulando(true);
        avancarSimulacao(ativaResp.ativa.id);
        return;
      }
      const listaResp = await chamarApi<{ simulacoes: EstadoSimulacao[] }>("/api/paralegal/robo-zen/simulacoes");
      if (cancelado || !listaResp.ok) return;
      const ultimaConcluida = listaResp.simulacoes?.find((s) => s.status === "concluida");
      if (ultimaConcluida) {
        setSimulacao(ultimaConcluida);
        void carregarResultado(ultimaConcluida.id);
      }
    })();
    return () => {
      cancelado = true;
      if (timerSimulacaoRef.current) clearTimeout(timerSimulacaoRef.current);
      if (timerLoteRef.current) clearTimeout(timerLoteRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarSimulacao() {
    setErroSimulacao(null);
    setResultado(null);
    setLote(null);
    setErroLote(null);
    setSimulando(true);
    const j = await chamarApi<{ simulacao: EstadoSimulacao }>("/api/paralegal/robo-zen/simulacoes", { method: "POST" });
    if (!j.ok || !j.simulacao) {
      setErroSimulacao(j.erro ?? "Não foi possível iniciar a simulação.");
      setSimulando(false);
      return;
    }
    setSimulacao(j.simulacao);
    avancarSimulacao(j.simulacao.id);
  }

  async function pararSimulacao() {
    if (!simulacao) return;
    await chamarApi(`/api/paralegal/robo-zen/simulacoes/${simulacao.id}/parar`, { method: "POST" });
  }

  function exportarResultadoCsv() {
    if (!resultado || !simulacao) return;
    const cab = [
      "Código", "Empresa", "CNPJ", "Pronta", "Motivo", "Status",
      "Docs elegíveis", "Documentos elegíveis", "Docs escaneados", "Documentos escaneados",
      "Docs ignorados", "Documentos ignorados",
    ];
    const linhas = resultado.resultados.map((r) => [
      r.codigo, r.empresa, r.cnpj, r.pronta ? "Sim" : "Não", r.motivo, r.status,
      r.qtdDocumentosElegiveis, r.documentosElegiveis, r.qtdDocumentosEscaneados, r.documentosEscaneados,
      r.qtdDocumentosIgnorados, r.documentosIgnorados,
    ]);
    baixarCsv(`robo-zen-simulacao-${simulacao.id.slice(0, 8)}.csv`, cab, linhas);
  }

  async function iniciarLote() {
    if (!simulacao || simulacao.status !== "concluida") return;
    setErroLote(null);
    setAvisoRedeLote(null);
    setLoteRodando(true);
    const j = await chamarApi<{ lote: EstadoLoteEnvio }>("/api/paralegal/robo-zen/lotes-envio", {
      method: "POST",
      body: JSON.stringify({ simulacaoId: simulacao.id }),
    });
    if (!j.ok || !j.lote) {
      setErroLote(j.erro ?? "Não foi possível iniciar o envio em lote.");
      setLoteRodando(false);
      return;
    }
    setLote(j.lote);
    setCheckLote(false);
    avancarLote(j.lote.id);
  }

  async function pararLote() {
    if (!lote) return;
    const j = await chamarApi<{ lote: EstadoLoteEnvio }>(`/api/paralegal/robo-zen/lotes-envio/${lote.id}/parar`, { method: "POST" });
    if (j.ok && j.lote) {
      setLote(j.lote);
      if (j.lote.concluida) {
        setLoteRodando(false);
        void carregarResultado(j.lote.simulacaoOrigemId);
      }
    } else if (j.erro) {
      setErroLote(j.erro);
    }
  }

  async function consultarEmpresa() {
    if (!busca.trim()) return;
    setConsultando(true);
    setErroConsulta(null);
    setConsulta(null);
    setPendente(null);
    setResultadoEnvio(null);
    setErroEnvio(null);
    const j = await chamarApi<{ origem: "simulacao" | "ao_vivo"; resultado: ResultadoConsultaEmpresa }>(
      "/api/paralegal/robo-zen/consultar-empresa",
      { method: "POST", body: JSON.stringify({ busca: busca.trim() }) }
    );
    setConsultando(false);
    if (!j.ok || !j.resultado) {
      setErroConsulta(j.erro ?? "Erro ao consultar a empresa.");
      return;
    }
    setConsulta({ origem: j.origem, resultado: j.resultado });
  }

  async function prepararEnvio() {
    if (!consulta) return;
    setPreparando(true);
    setErroEnvio(null);
    // Busca de novo pelo código exato (não pelo texto livre que a pessoa
    // digitou) — `localizarEmpresa` casa código exato antes de qualquer
    // outro critério, então isso garante a MESMA empresa que acabou de
    // aparecer na tela, sem ambiguidade de nome parcial.
    const j = await chamarApi<{
      token: string; empresa: string; codigo: string; cnpj: string; documentos: string[]; jaEnviados?: string[];
    }>(
      "/api/paralegal/robo-zen/preparar-envio",
      { method: "POST", body: JSON.stringify({ busca: consulta.resultado.codigo }) }
    );
    setPreparando(false);
    if (!j.ok || !j.token) {
      setErroEnvio(j.erro ?? "Não foi possível preparar o envio.");
      return;
    }
    setPendente({
      token: j.token, empresa: j.empresa, codigo: j.codigo, cnpj: j.cnpj, documentos: j.documentos, jaEnviados: j.jaEnviados ?? [],
    });
  }

  async function confirmarEnvio() {
    if (!pendente) return;
    setConfirmando(true);
    setErroEnvio(null);
    const j = await chamarApi<ResultadoEnvio>(
      "/api/paralegal/robo-zen/confirmar-envio",
      { method: "POST", body: JSON.stringify({ token: pendente.token }) }
    );
    setConfirmando(false);
    if (!j.ok) {
      setErroEnvio(j.erro ?? "Não foi possível confirmar o envio.");
      return;
    }
    setResultadoEnvio({ empresa: j.empresa, cnpj: j.cnpj, documentos: j.documentos ?? [] });
    setPendente(null);
  }

  function cancelarEnvio() {
    setPendente(null);
  }

  const progressoTexto = (() => {
    if (!simulacao) return "";
    if (simulacao.status === "mapeando") {
      return `Mapeando pastas de empresas: ${simulacao.pastasMapeadas}/${simulacao.totalPastas}`;
    }
    return `Processando empresas: ${simulacao.empresasProcessadas}/${simulacao.totalEmpresas} — ${simulacao.empresasProntas} pronta(s)`;
  })();

  const progressoPct = (() => {
    if (!simulacao) return 0;
    if (simulacao.status === "mapeando") {
      return simulacao.totalPastas > 0 ? (simulacao.pastasMapeadas / simulacao.totalPastas) * 50 : 0;
    }
    const baseProcessamento = simulacao.totalEmpresas > 0 ? (simulacao.empresasProcessadas / simulacao.totalEmpresas) * 50 : 0;
    return 50 + baseProcessamento;
  })();

  const lotePct = lote && lote.totalEmpresasProntas > 0 ? (lote.empresasProcessadas / lote.totalEmpresasProntas) * 100 : 0;

  // Quantas empresas ainda têm algo a enviar AGORA (o resultado já vem cruzado com o
  // registro de envios: as "Enviada" não contam). null = resultado ainda não carregado.
  const prontasAEnviar = resultado ? resultado.resultados.filter((r) => r.pronta).length : null;
  const nadaAEnviar = prontasAEnviar === 0;
  // Lote ativo que não está sendo empurrado por esta aba (rede caiu, desistiu das tentativas…).
  const loteParado = !!lote && lote.status === "processando" && !loteRodando;

  return (
    <>
      <div className="banner">
        <strong>Rodar simulação completa</strong> e a <strong>consulta de uma empresa</strong> (sem preparar envio) só
        leem — não mudam nada no Questor Zen. Já o botão <strong>vermelho de envio em lote</strong> (dentro da seção 1)
        e a <strong>confirmação de envio</strong> (seção 2) cadastram de verdade, sempre com uma confirmação explícita
        antes de gravar qualquer coisa.
      </div>

      {/* ---------------- Seção 1 ---------------- */}
      <section className="rz-secao">
        <div className="section-label mono">1 · Rodar simulação completa</div>
        <p className="desc">
          Confere todas as empresas de uma vez e monta um resultado no final. Pode demorar — tem leitura de PDF e,
          às vezes, reconhecimento de texto em documentos digitalizados (OCR).
        </p>

        <div className="toolbar">
          <button className="btn primary" onClick={iniciarSimulacao} disabled={simulando || loteRodando || loteParado}>
            {simulando ? "Rodando…" : "▶ Rodar simulação completa"}
          </button>
          {simulando && <button className="btn danger" onClick={pararSimulacao}>⏹ Parar</button>}
        </div>

        {erroSimulacao && <div className="banner error">{erroSimulacao}</div>}
        {simulacao && !simulando && simulacao.status === "parada" && (
          <div className="banner">
            Simulação interrompida antes de concluir ({simulacao.empresasProcessadas}/{simulacao.totalEmpresas} empresa(s) processada(s)).
          </div>
        )}

        {simulando && simulacao && (
          <div>
            <div className="rz-progress-bg">
              <div className="rz-progress-fill" style={{ width: `${Math.min(progressoPct, 100)}%` }} />
            </div>
            <p className="rz-progress-texto">{progressoTexto}</p>
            {simulacao.empresaAtual && <p className="rz-empresa-atual">{simulacao.empresaAtual}</p>}
          </div>
        )}

        {carregandoResultado && <p className="loading">Carregando resultado…</p>}

        {resultado && simulacao && !carregandoResultado && (
          <div style={{ marginTop: 16 }}>
            <h3>Resultado{simulacao.terminadoEm ? ` — ${formatarData(simulacao.terminadoEm)}` : ""}</h3>
            <div className="summary">
              {Object.entries(resultado.resumo).sort((a, b) => b[1] - a[1]).map(([motivo, qtd]) => (
                <div key={motivo} className="card">
                  <div className="k">{motivo}</div>
                  <div className="v num">{qtd}</div>
                </div>
              ))}
            </div>
            {resultado.situacaoDeEnvioConferida === false && (
              <div className="banner error">
                Não consegui conferir o registro de envios agora — o “Pronta” abaixo pode incluir empresas que já foram
                enviadas. O envio em si continua protegido: documento já enviado nunca é enviado de novo.
              </div>
            )}
            <div className="toolbar" ref={topoResultadoRef} style={{ scrollMarginTop: 12 }}>
              <button className="btn" onClick={exportarResultadoCsv} title="Baixa todas as empresas, não só as filtradas">⇩ Baixar CSV do resultado</button>
              <input
                className="search"
                style={{ minWidth: 220, flex: "1 1 220px", maxWidth: 360 }}
                placeholder="Buscar por código, empresa ou CNPJ…"
                value={buscaResultado}
                onChange={(e) => { setBuscaResultado(e.target.value); setPaginaResultado(1); }}
              />
              <select
                className="sel wide"
                value={filtroMotivo}
                onChange={(e) => { setFiltroMotivo(e.target.value); setPaginaResultado(1); }}
                aria-label="Filtrar por motivo"
              >
                <option value="">Todos os motivos ({resultado.resultados.length})</option>
                {Object.entries(resultado.resumo).sort((a, b) => b[1] - a[1]).map(([motivo, qtd]) => (
                  <option key={motivo} value={motivo}>{motivo} ({qtd})</option>
                ))}
              </select>
              <select
                className="sel"
                value={porPagina}
                onChange={(e) => { setPorPagina(Number(e.target.value)); setPaginaResultado(1); }}
                aria-label="Empresas por página"
              >
                {TAMANHOS_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}
              </select>
              {(buscaResultado.trim() || filtroMotivo) && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {linhasFiltradas.length} de {resultado.resultados.length} empresas
                </span>
              )}
            </div>
            {erroDownload && <div className="banner error">{erroDownload}</div>}
            {barraPaginas(false)}
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Código</th><th>Empresa</th><th>CNPJ</th><th style={{ textAlign: "center" }}>Pronta</th><th>Motivo</th><th>Contrato</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.itens.map((r) => (
                    <tr key={r.codigo}>
                      <td>{r.codigo}</td>
                      <td>{r.empresa}</td>
                      <td>{r.cnpj || <span className="dash">–</span>}</td>
                      <td style={{ textAlign: "center" }}>
                        {r.motivo === MOTIVO_ENVIADA ? (
                          <span className="badge badge-ok">Enviada</span>
                        ) : r.motivo === MOTIVO_ENVIO_INTERROMPIDO && !r.pronta ? (
                          <span className="badge badge-mudo">Conferir</span>
                        ) : (
                          <span className={`badge ${r.pronta ? "badge-ok" : "badge-mudo"}`}>{r.pronta ? "Pronta" : "—"}</span>
                        )}
                      </td>
                      <td>
                        {r.motivo}
                        {(r.motivo === MOTIVO_PRONTA_DOC_NOVO ||
                          r.motivo === MOTIVO_JA_ENVIADA_ALTERADA ||
                          r.motivo === MOTIVO_ENVIADA ||
                          r.motivo === MOTIVO_ENVIO_PARCIAL ||
                          r.motivo === MOTIVO_ENVIO_INTERROMPIDO) && r.status && (
                          <div className="dash" style={{ fontSize: 11, marginTop: 2, maxWidth: 340, whiteSpace: "normal" }}>
                            {/* o status começa repetindo o motivo — corta pra não aparecer duas vezes */}
                            {r.status.startsWith(r.motivo) ? r.status.slice(r.motivo.length).replace(/^[:.]\s*/, "") : r.status}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.documentos.length === 0 && <span className="dash">–</span>}
                        {r.documentos.length === 1 && (
                          <button
                            className="btn"
                            style={{ padding: "2px 10px", fontSize: 12 }}
                            disabled={baixandoContrato === `${r.codigo}:0`}
                            title={r.documentos[0]}
                            onClick={() => baixarContrato(r.codigo, 0)}
                          >
                            {baixandoContrato === `${r.codigo}:0` ? "Abrindo…" : "⇩ Baixar"}
                          </button>
                        )}
                        {r.documentos.length > 1 && (
                          <details>
                            <summary style={{ cursor: "pointer", fontSize: 12 }}>⇩ {r.documentos.length} arquivos</summary>
                            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
                              {r.documentos.map((nome, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>
                                  <button
                                    className="btn"
                                    style={{ padding: "2px 8px", fontSize: 12, textAlign: "left" }}
                                    disabled={baixandoContrato === `${r.codigo}:${i}`}
                                    onClick={() => baixarContrato(r.codigo, i)}
                                  >
                                    {baixandoContrato === `${r.codigo}:${i}` ? "Abrindo…" : `⇩ ${nome}`}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <tr>
                      <td className="loading" colSpan={6}>
                        {resultado.resultados.length === 0 ? "Nenhuma empresa mapeada." : "Nenhuma empresa encontrada com esse filtro."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {barraPaginas(true)}
          </div>
        )}

        <hr className="rz-sep" />

        <h3>🚀 Enviar de verdade — todas as empresas prontas</h3>
        <div className="rz-perigo-box">
          <p>
            Isso cadastra de verdade no Questor Zen os documentos de <strong>TODAS</strong> as empresas que estiverem
            PRONTA na tabela acima{prontasAEnviar !== null ? ` (${prontasAEnviar} a enviar agora)` : ""} — não é
            simulação. Quem já foi enviado aparece como <strong>Enviada</strong> e fica de fora: empresa/documento já
            enviado por esta tela nunca é enviado de novo (empresa já enviada que ganhou contrato novo manda só o novo).
            Se a conexão cair no meio, o envio continua de onde parou. Só uma pessoa roda o lote por vez.
            <strong> Não tem como desfazer depois.</strong>
          </p>
          <label className="rz-check">
            <input
              type="checkbox"
              checked={checkLote}
              onChange={(e) => setCheckLote(e.target.checked)}
              disabled={loteRodando || loteParado || simulando || !simulacao || simulacao.status !== "concluida" || nadaAEnviar}
            />
            Sim, quero enviar de verdade os documentos de todas as empresas prontas agora.
          </label>
          <div className="toolbar" style={{ margin: 0 }}>
            <button
              className="btn danger"
              onClick={iniciarLote}
              disabled={!checkLote || loteRodando || loteParado || simulando || !simulacao || simulacao.status !== "concluida" || nadaAEnviar}
            >
              🚀 Enviar de verdade TODAS as prontas
            </button>
            {loteRodando && <button className="btn" onClick={pararLote}>⏹ Parar</button>}
          </div>
          {(!simulacao || simulacao.status !== "concluida") && (
            <p className="footnote" style={{ marginTop: 10 }}>
              Rode e conclua uma simulação completa primeiro — o envio em lote parte do resultado dela.
            </p>
          )}
          {simulacao?.status === "concluida" && nadaAEnviar && (
            <p className="footnote" style={{ marginTop: 10 }}>
              Nada a enviar: todas as empresas prontas dessa simulação já foram enviadas ao Zen.
            </p>
          )}
        </div>

        {erroLote && <div className="banner error">{erroLote}</div>}
        {avisoRedeLote && <div className="banner">{avisoRedeLote}</div>}
        {loteRodando && lote && lote.falhasSeguidas > 0 && (
          <div className="banner">
            Aguardando o SharePoint/Zen/banco responder — tentando de novo (falha {lote.falhasSeguidas} de 10). Nada foi
            enviado nessa tentativa; o envio continua sozinho quando voltar.
          </div>
        )}
        {loteParado && lote && (
          <div className="banner">
            Há um envio em lote em andamento{lote.iniciadoPor ? ` (iniciado por ${lote.iniciadoPor})` : ""} que não está
            sendo empurrado por esta tela — {lote.empresasProcessadas}/{lote.totalEmpresasProntas} empresa(s). O que já foi
            enviado está salvo; ele continua de onde parou.{" "}
            <button className="btn" onClick={retomarLote}>▶ Continuar o envio</button>{" "}
            <button className="btn danger" onClick={pararLote}>⏹ Parar</button>
          </div>
        )}
        {lote && !loteRodando && lote.status === "parada" && (
          <div className="banner">Envio em lote interrompido antes de concluir. Dá pra iniciar de novo: o que já foi enviado não é enviado outra vez.</div>
        )}
        {lote && !loteRodando && lote.status === "concluida" && lote.documentosComErro > 0 && (
          <div className="banner error">
            Envio em lote terminou com {lote.documentosComErro} documento(s) com erro — veja a lista abaixo. Depois de
            resolver, dá pra iniciar o envio de novo: só o que falta é enviado.
          </div>
        )}

        {lote && (
          <div style={{ marginTop: 14 }}>
            <div className="rz-progress-bg">
              <div className="rz-progress-fill perigo" style={{ width: `${Math.min(lotePct, 100)}%` }} />
            </div>
            <p className="rz-progress-texto">
              {lote.empresasProcessadas}/{lote.totalEmpresasProntas} empresa(s) — {lote.empresasEnviadas} enviada(s),{" "}
              {lote.empresasJaEnviadas} já enviada(s) antes, {lote.documentosEnviados} documento(s) cadastrado(s)
              {lote.documentosComErro > 0 ? `, ${lote.documentosComErro} com erro` : ""}.
            </p>
            {lote.empresaAtual && <p className="rz-empresa-atual">{lote.empresaAtual}</p>}
            {lote.erros.length > 0 && (
              <div className="rz-erros">
                <ul>{lote.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Seção 2 ---------------- */}
      <section className="rz-secao">
        <div className="section-label mono">2 · Consultar uma empresa específica</div>
        <p className="desc">Digite o nome (ou parte do nome) ou o código da pasta da empresa.</p>

        <div className="rz-linha-busca">
          <input
            className="search"
            placeholder="Ex.: Memory Cream, ou 1433"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void consultarEmpresa(); }}
          />
          <button className="btn primary" onClick={consultarEmpresa} disabled={consultando || !busca.trim()}>
            {consultando ? "Consultando…" : "🔍 Consultar"}
          </button>
        </div>

        {erroConsulta && <div className="banner error">{erroConsulta}</div>}

        {consulta && (
          <div className="card" style={{ maxWidth: 720, marginBottom: 14 }}>
            <div className="rz-resultado-empresa">
              <span className="nome">{consulta.resultado.empresa} <span className="dash">#{consulta.resultado.codigo}</span></span>
              <span className="origem">{consulta.origem === "simulacao" ? "Da última simulação" : "Consulta ao vivo"}</span>
            </div>
            <dl className="rz-dl">
              <dt>CNPJ</dt><dd>{consulta.resultado.cnpj || "–"}</dd>
              <dt>Situação</dt>
              <dd><span className={`badge ${consulta.resultado.pronta ? "badge-ok" : "badge-mudo"}`}>{consulta.resultado.motivo || "—"}</span></dd>
              <dt>Detalhe</dt><dd>{consulta.resultado.status || "–"}</dd>
              <dt>Documentos elegíveis</dt><dd>{consulta.resultado.qtdDocumentosElegiveis}</dd>
              <dt>Documentos escaneados</dt><dd>{consulta.resultado.qtdDocumentosEscaneados}</dd>
              <dt>Documentos ignorados</dt><dd>{consulta.resultado.qtdDocumentosIgnorados}</dd>
            </dl>

            {consulta.resultado.pronta && !pendente && !resultadoEnvio && (
              <div className="toolbar" style={{ margin: "8px 0 0" }}>
                <button className="btn danger" onClick={prepararEnvio} disabled={preparando}>
                  {preparando ? "Preparando…" : "📤 Enviar de verdade pro Questor"}
                </button>
              </div>
            )}
          </div>
        )}

        {pendente && (
          <div className="rz-confirm">
            <h4>⚠ Confirme antes de enviar de verdade</h4>
            <p>Isso vai gravar estes documentos no Questor Zen agora. <strong>Não dá pra desfazer depois.</strong> Confira a lista:</p>
            <dl className="rz-dl">
              <dt>Empresa</dt><dd>{pendente.empresa} (#{pendente.codigo})</dd>
              <dt>CNPJ</dt><dd>{pendente.cnpj}</dd>
              <dt>Documentos</dt><dd>{pendente.documentos.join("; ")}</dd>
              {pendente.jaEnviados.length > 0 && (
                <>
                  <dt>Já enviados antes</dt>
                  <dd>{pendente.jaEnviados.join("; ")} <span className="dash">(não vão de novo)</span></dd>
                </>
              )}
            </dl>
            <p className="footnote">Esta confirmação vale por 15 minutos e só pode ser usada uma vez.</p>
            <div className="toolbar" style={{ margin: 0 }}>
              <button className="btn" onClick={cancelarEnvio} disabled={confirmando}>Cancelar</button>
              <button className="btn danger" onClick={confirmarEnvio} disabled={confirmando}>
                {confirmando ? "Enviando…" : "✓ Confirmar e enviar"}
              </button>
            </div>
          </div>
        )}

        {erroEnvio && <div className="banner error">{erroEnvio}</div>}

        {resultadoEnvio && (
          <div className="banner" style={{ marginTop: 12 }}>
            Enviado com sucesso: <strong>{resultadoEnvio.empresa}</strong> (CNPJ {resultadoEnvio.cnpj}) —{" "}
            {resultadoEnvio.documentos.length} documento(s) cadastrado(s) no Questor Zen.
          </div>
        )}
      </section>
    </>
  );
}
