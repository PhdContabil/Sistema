"use client";

// Notas MEI (menu_mei): profissionais do salão, notas do período, Exportar Notas, Exportar DAS,
// relatório rel_notas e a tela de emissão (emitirnota).
import { useEffect, useMemo, useState } from "react";
import { api, ler, st, Tabela, Campo, Modal, SelectSalao, baixarCsv, imprimir, esc, brl, dt, primeiroDiaMes, ultimoDiaMes, hojeISO, mensagemErro, AVULSO, verificarRobo, AvisoRobo, ErroRobo, fmtDoc, type RoboEstado, type Mei } from "./ui";

interface Nota { codigoempresa: number; nome: string; cnpj: string; chave: number; codigopessoa: number | null; numeronf: number; especienf: string; serienf: string | null; datalctofis: string; valorcontabil: number; usuario?: string }
const limpo = (s: string) => String(s ?? "").replace(/[\r\n]+\d*\s*$/g, "").replace(/[\r\n]+/g, " ").trim();
// Nota "sem tomador": o participante no Questor é um cadastro genérico, sem CPF/CNPJ
// (3 = CLIENTES DIVERSOS, 3108 = AVULSOS — os únicos usados pelos MEIs desde 2024).
const PESSOAS_SEM_TOMADOR = new Set([3, 3108]);
const semTomador = (n: Nota) => n.codigopessoa == null || PESSOAS_SEM_TOMADOR.has(Number(n.codigopessoa));
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function Notas({ mei }: { mei: Mei[] }) {
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(ultimoDiaMes());
  const [sal, setSal] = useState(String(AVULSO));
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [info, setInfo] = useState("");
  const [emitir, setEmitir] = useState<Mei | null>(null);

  // Profissionais do salão ainda ativos no início do período (consultaMenu_MEI: DATAENCERATIV > datainicio).
  const prof = useMemo(() => mei.filter((m) => String(m.salaoCod) === sal && (m.fim ?? "9999") > de).sort((a, b) => a.razao.localeCompare(b.razao)), [mei, sal, de]);
  const porCod = useMemo(() => new Map(mei.map((m) => [m.cod, m])), [mei]);
  const nomeSalao = mei.find((m) => String(m.salaoCod) === sal)?.salao ?? "";

  useEffect(() => {
    if (!sal) return;
    setInfo("Consultando notas…"); setNotas(null);
    // A API aceita no máximo 92 dias por consulta: períodos maiores são buscados em partes e somados.
    (async () => {
      if (!de || !ate || de > ate) { setInfo("Confira as datas: a inicial precisa ser antes da final."); setNotas([]); return; }
      const partes: [string, string][] = [];
      for (let ini = new Date(de + "T12:00:00"); ini.toISOString().slice(0, 10) <= ate; ) {
        const fim = new Date(ini); fim.setDate(fim.getDate() + 89);
        const f = fim.toISOString().slice(0, 10) > ate ? ate : fim.toISOString().slice(0, 10);
        partes.push([ini.toISOString().slice(0, 10), f]);
        ini = new Date(f + "T12:00:00"); ini.setDate(ini.getDate() + 1);
      }
      try {
        const todas: Nota[] = []; let truncado = false;
        for (const [a1, b1] of partes) {
          const j = await ler<{ dados: Nota[]; total: number; truncado: boolean }>("/fiscal/lancamentos", { tipo: "saida", salao: sal, data_inicio: a1, data_fim: b1 });
          todas.push(...(j.dados ?? [])); truncado = truncado || !!j.truncado;
        }
        setNotas(todas);
        setInfo(`${todas.length} nota(s)${partes.length > 1 ? ` (período buscado em ${partes.length} partes)` : ""}${truncado ? " — parte do resultado foi cortada pela API (5000 linhas); diminua o período" : ""}`);
      } catch (e) { setInfo(e instanceof Error ? e.message : "Falha ao buscar as notas."); }
    })();
  }, [sal, de, ate]);

  const [filtroTom, setFiltroTom] = useState<"" | "com" | "sem">("");
  const visiveis = (notas ?? []).filter((n) => !filtroTom || (filtroTom === "sem") === semTomador(n));
  const soma = (l: Nota[]) => l.reduce((a, n) => a + (n.valorcontabil || 0), 0);
  const total = soma(visiveis);
  const comT = (notas ?? []).filter((n) => !semTomador(n)); const semT = (notas ?? []).filter(semTomador);

  function exportarNotas() {
    // exportarnota: usuário/senha da prefeitura, CNPJ do tomador (salão), nome, valor, número, série, data, município.
    baixarCsv("exportar_notas.csv", ["Usuário prefeitura", "CNPJ tomador", "Profissional", "Valor", "Número", "Série", "Data", "Município", "Tomador"],
      visiveis.map((n) => { const m = porCod.get(n.codigoempresa); return ["", semTomador(n) ? "" : m?.salaoCnpj ?? "", limpo(n.nome), String(n.valorcontabil).replace(".", ","), n.numeronf, n.serienf ?? "", dt(n.datalctofis), m?.cidade ?? "", semTomador(n) ? "Sem tomador" : "Com tomador"]; }));
  }
  function exportarDas() {
    const mes = MESES[Number(ate.slice(5, 7)) - 1];
    baixarCsv("exportar_das.csv", ["CNPJ", "Mês", "Nome", "Bloqueio"], mei.filter((m) => m.ativo && String(m.salaoCod) === sal).map((m) => [m.cnpj.replace(/\D/g, ""), mes, m.razao, m.bloqueado ? "BLOQUEADO" : ""]));
  }
  function relatorio() {
    // Relatório separado: notas com tomador (salão) e notas sem tomador, cada bloco com o seu total.
    const bloco = (titulo: string, l: Nota[]) => !l.length ? "" : `<h3>${titulo} (${l.length})</h3><table><tr><th>Cód.</th><th>Profissional</th><th>Nº</th><th>Série</th><th>Data</th><th class="dir">Valor</th></tr>${l.map((n) => `<tr><td>${n.codigoempresa}</td><td>${esc(limpo(n.nome))}</td><td>${n.numeronf}</td><td>${esc(n.serienf ?? "")}</td><td>${dt(n.datalctofis)}</td><td class="dir">${brl(n.valorcontabil)}</td></tr>`).join("")}</table><p class="dir"><b>Subtotal: ${brl(soma(l))}</b></p>`;
    const c = visiveis.filter((n) => !semTomador(n)); const s2 = visiveis.filter(semTomador);
    imprimir(`Notas MEI — ${esc(nomeSalao)}`, `<p>Período: ${dt(de)} a ${dt(ate)}</p>${bloco("Notas com tomador", c)}${bloco("Notas sem tomador", s2)}<p class="dir"><b>Total geral: ${brl(soma(visiveis))}</b></p>`);
  }

  return (
    <div>
      <div style={st.card}>
        <div style={st.bar}>
          <Campo label="Data inicial"><input type="date" style={st.input} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo label="Data final"><input type="date" style={st.input} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
          <SelectSalao mei={mei} valor={sal} onChange={setSal} todos={false} />
          <Campo label="Tomador"><select style={st.input} value={filtroTom} onChange={(e) => setFiltroTom(e.target.value as "" | "com" | "sem")}><option value="">Todas</option><option value="com">Com tomador</option><option value="sem">Sem tomador</option></select></Campo>
          <button style={st.btn} onClick={exportarNotas} disabled={!visiveis.length}>Exportar notas</button>
          <button style={st.btn} onClick={exportarDas}>Exportar DAS</button>
          <button style={st.btn} onClick={relatorio} disabled={!notas}>Relatório</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", gap: 12 }}>
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Profissionais ({prof.length})</h3>
          <Tabela cab={["Cód.", "Profissional", ""]} linhas={prof.map((m) => [m.cod, m.razao, <button key="n" style={st.btn} onClick={() => setEmitir(m)}>Nota</button>])} />
        </div>
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Notas do período</h3>
          <p style={st.mut}>{info}</p>
          {notas && <p style={st.mut}>Com tomador: <b>{comT.length}</b> · {brl(soma(comT))} — Sem tomador: <b>{semT.length}</b> · {brl(soma(semT))}</p>}
          {notas && <Tabela cab={["Cód.", "Profissional", "Nº NF", "Série", "Data", "Tomador", "Valor"]} linhas={visiveis.map((n) => [n.codigoempresa, limpo(n.nome), n.numeronf, n.serienf ?? "", dt(n.datalctofis), semTomador(n) ? "Sem tomador" : "Com tomador", brl(n.valorcontabil)])} />}
          {notas && <p style={{ textAlign: "right", fontWeight: 600 }}>Total{filtroTom ? (filtroTom === "sem" ? " (sem tomador)" : " (com tomador)") : ""}: {brl(total)}</p>}
        </div>
      </div>
      {emitir && <EmitirNota m={emitir} data={ate} fechar={() => setEmitir(null)} />}
    </div>
  );
}

const DISCRIMINACAO = "NOTA PELO PRESTADOR. Serviços prestados de beleza, conforme resolução CGSN nº 140 de 22 de maio de 2018, cota parte profissional parceiro.";

/** emitirnota: prepara a nota (número = última + 1, série = última ou "S", tomador = salão). */
interface ResultadoNota {
  ok?: boolean; dry_run?: boolean; ja_lancada?: boolean; numeronf?: number; serie?: string;
  saida?: { codigoempresa: number; chave: number; numeronf: number; serie: string; cfop: number; tabela: number };
  entrada?: { codigoempresa: number; codigoestab: number; chave: number; cfop: number; tabela: number; atividade_mei?: string } | null;
  iss?: { codigocampo: number; valor: string } | null; salao?: { codigopessoafin: number; nome: string } | null; avisos?: string[];
}

/** emitirnota: lança no Questor a NFS-e já emitida no Portal Nacional (saída no MEI + entrada no salão + ISS). */
/** Tomador da nota: no salão AVULSO o Questor guarda CNPJ fictício (555…); no portal vai o CPF 000.000.000-00. */
function tomadorDoc(m: { salaoCod?: number | null; salaoCnpj?: string }): string {
  const d = (m.salaoCnpj ?? "").replace(/\D/g, "");
  if (m.salaoCod === AVULSO || /^5+$/.test(d)) return "00000000000";
  return d;
}

export function EmitirNota({ m, data, fechar }: { m: Mei; data: string; fechar: () => void }) {
  const [d, setD] = useState({ data: data > hojeISO() ? hojeISO() : data, valor: "", numero: "", serie: "", obs: DISCRIMINACAO });
  const [roboEstado, setRoboEstado] = useState<RoboEstado>("ok");
  const [robo, setRobo] = useState<{ id?: string; status: string; passos: { msg: string }[]; erro?: string } | null>(null);
  const [sugestao, setSugestao] = useState("");
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<{ r: ResultadoNota; simulacao: boolean } | null>(null);
  const [soSaida, setSoSaida] = useState(false);
  // Tomador: o salão do cadastro (padrão), sem tomador, ou outro CNPJ/CPF digitado.
  const [tomadorModo, setTomadorModo] = useState<"salao" | "sem" | "outro">("salao");
  const [tomadorOutro, setTomadorOutro] = useState("");
  const tomador = tomadorModo === "salao" ? tomadorDoc(m) : tomadorModo === "outro" ? tomadorOutro.replace(/\D/g, "") : "";
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api<{ dados: Nota[] }>("GET", "/fiscal/lancamentos", { query: { tipo: "saida", codigoempresa: m.cod, data_inicio: new Date(Date.now() - 91 * 864e5).toISOString().slice(0, 10), data_fim: hojeISO() } }).then((r) => {
      if (r.status !== 200) { setSugestao("não consegui consultar as últimas notas"); return; }
      const L = (r.dados.dados ?? []).sort((a, b) => a.datalctofis.localeCompare(b.datalctofis) || a.chave - b.chave);
      const ult = L[L.length - 1];
      setSugestao(ult ? `última lançada: nº ${ult.numeronf} série ${ult.serienf ?? "—"} em ${dt(ult.datalctofis)}` : "nenhuma nota nos últimos 3 meses");
      // Como no Access: número = última nota + 1 e série = a da última (pode ajustar se o portal gerar outro).
      setD((x) => ({ ...x, serie: x.serie || ult?.serienf || "S", numero: x.numero || String((ult?.numeronf ?? 0) + 1) }));
    }).catch(() => null);
  }, [m.cod]);

  // Robô (igual ao "Salvar" do Access): abre o Emissor Nacional no PC de quem emite e preenche a nota.
  async function preencherPortal() {
    setErro("");
    const valor = Number(d.valor.replace(/\./g, "").replace(",", "."));
    if (!valor || !d.data) { setErro("Informe a data e o valor antes de preencher no portal."); return; }
    if (tomadorModo === "salao" && !tomador) { setErro("Salão sem CNPJ no cadastro — escolha \"Outro\" e digite o tomador, ou \"Sem tomador\"."); return; }
    if (tomadorModo === "outro" && ![11, 14].includes(tomador.length)) { setErro("Tomador: digite um CPF (11 números) ou CNPJ (14 números)."); return; }
    const estado = await verificarRobo();
    setRoboEstado(estado);
    if (estado !== "ok") return;
    setRobo({ status: "buscando senha", passos: [] });
    const rc = await fetch(`/api/mei/nota/credenciais?cod=${m.cod}`);
    const jc = await rc.json();
    if (!rc.ok) { setRobo({ status: "erro", erro: jc.error ?? "Falha ao buscar a senha (sem senha cadastrada?).", passos: [] }); return; }
    const r = await fetch("http://localhost:3199/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      cod: m.cod, razao: m.razao, data: d.data, valor, tomadorCnpj: tomador, descricao: d.obs,
      municipio: m.cidade, uf: m.uf, codigoativmunic: (m.ativMunic || "").split(" ")[0], creds: jc.creds,
    }) });
    const j = await r.json();
    if (!r.ok) { setRobo({ status: "erro", erro: j.erro ?? "O robô recusou.", passos: [] }); return; }
    setRobo({ ...j, passos: [{ msg: `Login: ${jc.origem}` }, ...(j.passos ?? [])] });
    const id = j.id;
    const t = setInterval(async () => {
      try {
        const s = await (await fetch(`http://localhost:3199/jobs/${id}`)).json();
        setRobo({ ...s, passos: [{ msg: `Login: ${jc.origem}` }, ...(s.passos ?? [])] });
        if (!["preparando", "login", "preenchendo"].includes(s.status)) clearInterval(t);
      } catch { clearInterval(t); }
    }, 1500);
  }
  async function cancelarRobo() {
    if (robo?.id) await fetch(`http://localhost:3199/jobs/${robo.id}/cancelar`, { method: "POST" }).catch(() => null);
    setRobo(null);
  }

  async function lancar(_lancarEntrada = false) {
    setErro(""); setRes(null);
    const valor = d.valor.replace(/\./g, "").replace(",", ".");
    if (!d.numero || !Number(valor) || !d.data) { setErro("Informe o número da nota emitida no portal, a data e o valor."); return; }
    if (!confirm(`Lançar no Questor a NF ${d.numero} série ${d.serie || "(última)"} de ${dt(d.data)}, valor R$ ${d.valor}? (só no cadastro do profissional)`)) return;
    setEnviando(true);
    try {
      const r = await api<ResultadoNota & { detail?: unknown }>("POST", "/fiscal/nota-servico", {
        corpo: { codigoempresa_mei: m.cod, data: d.data, valor, numeronf: Number(d.numero), serie: d.serie || null, lancar_entrada: false, tomador_modo: tomadorModo, tomador_doc: tomadorModo === "sem" ? null : (tomador || null) }, // pedido do contábil (Du, 19/10/2026): salva só no profissional; o salão pega a nota pelo portal
        idempotencia: `nota-mei-${m.cod}-${d.numero}-${d.serie}-${d.data}`,
      });
      if (r.status >= 300) {
        setErro(mensagemErro(r));
        // Salão é empresa mas o CNPJ do MEI não está em PESSOA: a API recusa tudo (409); dá para lançar só a saída.
        void setSoSaida;
        return;
      }
      setRes({ r: r.dados, simulacao: r.dryRunForcado || !!r.dados.dry_run });
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao lançar."); }
    finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Nota — ${m.cod} - ${m.razao}`} fechar={fechar} largura={760}>
      {m.bloqueado && <div style={{ ...st.aviso, color: "var(--div)" }}>Empresa BLOQUEADA — no Access a emissão fica desabilitada.</div>}
      <div style={st.grid}>
        <Campo label="Tomador">
          <select style={st.input} value={tomadorModo} onChange={(e) => setTomadorModo(e.target.value as "salao" | "sem" | "outro")}>
            <option value="salao">{`Salão: ${m.salao} ${fmtDoc(tomadorDoc(m))}`}</option>
            <option value="sem">Sem tomador (não identificado)</option>
            <option value="outro">Outro tomador (digitar CPF/CNPJ)</option>
          </select>
          {tomadorModo === "outro" && <input style={{ ...st.input, marginTop: 6 }} placeholder="CPF ou CNPJ do tomador" value={tomadorOutro} onChange={(e) => setTomadorOutro(e.target.value)} />}
        </Campo>
        <Campo label="Número da NFS-e (do portal) *"><input style={st.input} value={d.numero} onChange={(e) => setD({ ...d, numero: e.target.value.replace(/\D/g, "") })} /></Campo>
        <Campo label="Série"><input style={st.input} value={d.serie} maxLength={4} onChange={(e) => setD({ ...d, serie: e.target.value.toUpperCase() })} /></Campo>
        <Campo label="Data *"><input type="date" style={st.input} value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></Campo>
        <Campo label="Valor *"><input style={st.input} value={d.valor} onChange={(e) => setD({ ...d, valor: e.target.value })} placeholder="0,00" /></Campo>
      </div>
      {sugestao && <p style={st.mut}>Referência: {sugestao}. O portal numera por conta própria — use o número da nota emitida.</p>}
      <Campo label="Discriminação do serviço (para o portal)"><textarea style={{ ...st.input, minHeight: 70 }} value={d.obs} onChange={(e) => setD({ ...d, obs: e.target.value })} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnP} disabled={m.bloqueado || (!!robo && ["buscando senha", "preparando", "login", "preenchendo"].includes(robo.status))} onClick={preencherPortal}>1) Preencher no Emissor Nacional (robô)</button>
        {robo && <button style={st.btn} onClick={cancelarRobo}>Cancelar robô</button>}
        <button style={st.btn} disabled={enviando || m.bloqueado} onClick={() => lancar(true)}>{enviando ? "Lançando…" : "2) Lançar no Questor"}</button>
        <button style={st.btn} onClick={() => navigator.clipboard?.writeText(d.obs)}>Copiar discriminação</button>
        
      </div>
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <AvisoRobo estado={roboEstado} fechar={() => setRoboEstado("ok")} />
      {robo && (
        <div style={{ ...st.card, marginTop: 10 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Robô: {({ "buscando senha": "buscando a senha…", preparando: "abrindo o Chrome…", login: "fazendo login…", preenchendo: "preenchendo a nota…", aguardando_confirmacao: "PRONTO — confira na janela do Chrome e clique em EMITIR lá. Depois informe o número da nota acima e lance no Questor.", erro: "erro", cancelada: "cancelado", fechada: "janela do Chrome fechada" } as Record<string, string>)[robo.status] ?? robo.status}</p>
          {robo.erro && <ErroRobo erro={robo.erro} jobId={robo.id} passos={robo.passos} contexto={`Emissão de NFS-e (Emissor Nacional) — MEI ${m.cod} - ${m.razao}, data ${d.data}, valor ${d.valor}`} />}
          {robo.passos.slice(-6).map((p, i) => <p key={i} style={{ ...st.mut, margin: "2px 0" }}>• {p.msg}</p>)}
        </div>
      )}
      {res && (
        <div style={{ ...st.card, marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: res.simulacao ? "var(--text)" : "var(--ok)" }}>
            {res.r.ja_lancada ? "Esta nota já estava lançada — nada foi gravado." : res.simulacao ? "SIMULAÇÃO (dry_run): a API executou e desfez — nada foi gravado." : "Nota lançada no Questor."}
          </p>
          <Tabela cab={["Lado", "Empresa", "Chave", "CFOP", "Tabela", "Detalhe"]} linhas={[
            ["Saída (MEI)", res.r.saida?.codigoempresa ?? "", res.r.saida?.chave ?? "", res.r.saida?.cfop ?? "", res.r.saida?.tabela ?? "", `NF ${res.r.numeronf} série ${res.r.serie}`],
            ["Entrada (salão)", res.r.entrada?.codigoempresa ?? "—", res.r.entrada?.chave ?? "", res.r.entrada?.cfop ?? "", res.r.entrada?.tabela ?? "", res.r.salao?.nome ?? ""],
            ["ISS (campo 231)", "", "", "", "", res.r.iss ? res.r.iss.valor : "não lançado"],
          ]} />
          {(res.r.avisos ?? []).filter((a) => !/dry_run/i.test(a)).map((a, i) => <p key={i} style={st.mut}>• {a}</p>)}
        </div>
      )}
    </Modal>
  );
}
