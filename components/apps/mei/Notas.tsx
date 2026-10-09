"use client";

// Notas MEI (menu_mei): profissionais do salão, notas do período, Exportar Notas, Exportar DAS,
// relatório rel_notas e a tela de emissão (emitirnota).
import { useEffect, useMemo, useState } from "react";
import { api, ler, st, Tabela, Campo, Modal, SelectSalao, baixarCsv, imprimir, esc, brl, dt, primeiroDiaMes, ultimoDiaMes, mensagemErro, AVULSO, type Mei } from "./ui";

interface Nota { codigoempresa: number; nome: string; cnpj: string; chave: number; codigopessoa: number | null; numeronf: number; especienf: string; serienf: string | null; datalctofis: string; valorcontabil: number; usuario?: string }
const limpo = (s: string) => String(s ?? "").replace(/[\r\n]+\d*\s*$/g, "").replace(/[\r\n]+/g, " ").trim();
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
    ler<{ dados: Nota[]; total: number; truncado: boolean }>("/fiscal/lancamentos", { tipo: "saida", salao: sal, data_inicio: de, data_fim: ate })
      .then((j) => { setNotas(j.dados ?? []); setInfo(`${j.total} nota(s)${j.truncado ? " — resultado truncado pela API (5000 linhas)" : ""}`); })
      .catch((e) => setInfo(e.message));
  }, [sal, de, ate]);

  const total = (notas ?? []).reduce((a, n) => a + (n.valorcontabil || 0), 0);

  function exportarNotas() {
    // exportarnota: usuário/senha da prefeitura, CNPJ do tomador (salão), nome, valor, número, série, data, município.
    baixarCsv("exportar_notas.csv", ["Usuário prefeitura", "CNPJ tomador", "Profissional", "Valor", "Número", "Série", "Data", "Município"],
      (notas ?? []).map((n) => { const m = porCod.get(n.codigoempresa); return ["", m?.salaoCnpj ?? "", limpo(n.nome), String(n.valorcontabil).replace(".", ","), n.numeronf, n.serienf ?? "", dt(n.datalctofis), m?.cidade ?? ""]; }));
  }
  function exportarDas() {
    const mes = MESES[Number(ate.slice(5, 7)) - 1];
    baixarCsv("exportar_das.csv", ["CNPJ", "Mês", "Nome", "Bloqueio"], mei.filter((m) => m.ativo && String(m.salaoCod) === sal).map((m) => [m.cnpj, mes, m.razao, m.bloqueado ? "BLOQUEADO" : ""]));
  }
  function relatorio() {
    const linhas = (notas ?? []).map((n) => `<tr><td>${n.codigoempresa}</td><td>${esc(limpo(n.nome))}</td><td>${n.numeronf}</td><td>${esc(n.serienf ?? "")}</td><td>${dt(n.datalctofis)}</td><td class="dir">${brl(n.valorcontabil)}</td></tr>`).join("");
    imprimir(`Notas MEI — ${esc(nomeSalao)}`, `<p>Período: ${dt(de)} a ${dt(ate)}</p><table><tr><th>Cód.</th><th>Profissional</th><th>Nº</th><th>Série</th><th>Data</th><th class="dir">Valor</th></tr>${linhas}</table><p class="dir"><b>Total: ${brl(total)}</b></p>`);
  }

  return (
    <div>
      <div style={st.card}>
        <div style={st.bar}>
          <Campo label="Data inicial"><input type="date" style={st.input} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo label="Data final"><input type="date" style={st.input} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
          <SelectSalao mei={mei} valor={sal} onChange={setSal} todos={false} />
          <button style={st.btn} onClick={exportarNotas} disabled={!notas?.length}>Exportar notas</button>
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
          {notas && <Tabela cab={["Cód.", "Profissional", "Nº NF", "Série", "Data", "Valor"]} linhas={notas.map((n) => [n.codigoempresa, limpo(n.nome), n.numeronf, n.serienf ?? "", dt(n.datalctofis), brl(n.valorcontabil)])} />}
          {notas && <p style={{ textAlign: "right", fontWeight: 600 }}>Total: {brl(total)}</p>}
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
function EmitirNota({ m, data, fechar }: { m: Mei; data: string; fechar: () => void }) {
  const [d, setD] = useState({ data, valor: "", numero: "", serie: "", obs: DISCRIMINACAO });
  const [sugestao, setSugestao] = useState("");
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<{ r: ResultadoNota; simulacao: boolean } | null>(null);
  const [soSaida, setSoSaida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api<{ dados: Nota[] }>("GET", "/fiscal/lancamentos", { query: { tipo: "saida", codigoempresa: m.cod, data_inicio: "2000-01-01", data_fim: "2100-12-31" } }).then((r) => {
      if (r.status !== 200) return;
      const L = (r.dados.dados ?? []).sort((a, b) => a.datalctofis.localeCompare(b.datalctofis) || a.chave - b.chave);
      const ult = L[L.length - 1];
      setSugestao(`última lançada: nº ${ult?.numeronf ?? "—"} série ${ult?.serienf ?? "—"} em ${dt(ult?.datalctofis)}`);
      setD((x) => ({ ...x, serie: x.serie || ult?.serienf || "S" }));
    }).catch(() => null);
  }, [m.cod]);

  async function lancar(lancarEntrada = true) {
    setErro(""); setRes(null);
    const valor = d.valor.replace(/\./g, "").replace(",", ".");
    if (!d.numero || !Number(valor) || !d.data) { setErro("Informe o número da nota emitida no portal, a data e o valor."); return; }
    if (!confirm(`Lançar no Questor a NF ${d.numero} série ${d.serie || "(última)"} de ${dt(d.data)}, valor R$ ${d.valor}?${lancarEntrada ? "" : " (SÓ A SAÍDA, sem entrada no salão)"}`)) return;
    setEnviando(true);
    try {
      const r = await api<ResultadoNota & { detail?: unknown }>("POST", "/fiscal/nota-servico", {
        corpo: { codigoempresa_mei: m.cod, data: d.data, valor, numeronf: Number(d.numero), serie: d.serie || null, lancar_entrada: lancarEntrada },
        idempotencia: `nota-mei-${m.cod}-${d.numero}-${d.serie}-${d.data}`,
      });
      if (r.status >= 300) {
        setErro(mensagemErro(r));
        // Salão é empresa mas o CNPJ do MEI não está em PESSOA: a API recusa tudo (409); dá para lançar só a saída.
        if (r.status === 409 && /pessoa/i.test(JSON.stringify(r.dados))) setSoSaida(true);
        return;
      }
      setRes({ r: r.dados, simulacao: r.dryRunForcado || !!r.dados.dry_run });
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao lançar."); }
    finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Nota — ${m.cod} - ${m.razao}`} fechar={fechar} largura={760}>
      {m.bloqueado && <div style={{ ...st.aviso, color: "var(--div)" }}>Empresa BLOQUEADA — no Access a emissão fica desabilitada.</div>}
      <div style={st.aviso}>1) Emita a nota no <b>Emissor Nacional NFS-e</b> (o robô do Access ainda não foi migrado). 2) Informe aqui o <b>número que o portal gerou</b> e lance no Questor: saída no MEI e entrada no salão, com CFOP e ISS como no Access.</div>
      <div style={st.grid}>
        <Campo label="Tomador (salão)"><input style={st.input} readOnly value={`${m.salao} ${m.salaoCnpj}`} /></Campo>
        <Campo label="Número da NFS-e (do portal) *"><input style={st.input} value={d.numero} onChange={(e) => setD({ ...d, numero: e.target.value.replace(/\D/g, "") })} /></Campo>
        <Campo label="Série"><input style={st.input} value={d.serie} maxLength={4} onChange={(e) => setD({ ...d, serie: e.target.value.toUpperCase() })} /></Campo>
        <Campo label="Data *"><input type="date" style={st.input} value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></Campo>
        <Campo label="Valor *"><input style={st.input} value={d.valor} onChange={(e) => setD({ ...d, valor: e.target.value })} placeholder="0,00" /></Campo>
      </div>
      {sugestao && <p style={st.mut}>Referência: {sugestao}. O portal numera por conta própria — use o número da nota emitida.</p>}
      <Campo label="Discriminação do serviço (para o portal)"><textarea style={{ ...st.input, minHeight: 70 }} value={d.obs} onChange={(e) => setD({ ...d, obs: e.target.value })} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnP} disabled={enviando || m.bloqueado} onClick={() => lancar(true)}>{enviando ? "Lançando…" : "Lançar no Questor"}</button>
        <button style={st.btn} onClick={() => navigator.clipboard?.writeText(d.obs)}>Copiar discriminação</button>
        {soSaida && <button style={st.btnD} onClick={() => lancar(false)}>Lançar só a saída</button>}
      </div>
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
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
