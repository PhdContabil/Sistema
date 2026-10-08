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
function EmitirNota({ m, data, fechar }: { m: Mei; data: string; fechar: () => void }) {
  const [prox, setProx] = useState<{ numero: number; serie: string } | null>(null);
  const [d, setD] = useState({ data, valor: "", obs: DISCRIMINACAO });
  const [erro, setErro] = useState("");
  useEffect(() => {
    api<{ dados: Nota[] }>("GET", "/fiscal/lancamentos", { query: { tipo: "saida", codigoempresa: m.cod, data_inicio: "2000-01-01", data_fim: "2100-12-31" } }).then((r) => {
      if (r.status !== 200) { setErro(mensagemErro(r)); return; }
      const L = (r.dados.dados ?? []).sort((a, b) => a.datalctofis.localeCompare(b.datalctofis) || a.chave - b.chave);
      const ult = L[L.length - 1];
      setProx({ numero: (ult?.numeronf ?? 0) + 1, serie: ult?.serienf || "S" });
    }).catch((e) => setErro(e.message));
  }, [m.cod]);
  return (
    <Modal titulo={`Nota — ${m.cod} - ${m.razao}`} fechar={fechar} largura={720}>
      {m.bloqueado && <div style={{ ...st.aviso, color: "var(--div)" }}>Empresa BLOQUEADA — no Access a emissão fica desabilitada.</div>}
      <div style={st.grid}>
        <Campo label="Tomador (salão)"><input style={st.input} readOnly value={`${m.salao} ${m.salaoCnpj}`} /></Campo>
        <Campo label="Número"><input style={st.input} readOnly value={prox?.numero ?? (erro ? "" : "…")} /></Campo>
        <Campo label="Série"><input style={st.input} readOnly value={prox?.serie ?? ""} /></Campo>
        <Campo label="Data"><input type="date" style={st.input} value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></Campo>
        <Campo label="Valor"><input style={st.input} value={d.valor} onChange={(e) => setD({ ...d, valor: e.target.value })} placeholder="0,00" /></Campo>
      </div>
      <Campo label="Discriminação do serviço"><textarea style={{ ...st.input, minHeight: 80 }} value={d.obs} onChange={(e) => setD({ ...d, obs: e.target.value })} /></Campo>
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <div style={{ ...st.aviso, marginTop: 12 }}>
        <b>Ainda não dá para salvar daqui.</b> No Access, “Salvar” faz duas coisas: (1) o robô (Selenium) abre o Emissor Nacional NFS-e com a senha da empresa e preenche a nota — DPS simplificada se a data é hoje, completa se é outra data; (2) lança a nota no Questor: saída no MEI (CFOP 9000002, tabela 225) e entrada no salão (CFOP 8000310 para atividades 06.01/06.02/06.05, senão 8000419; tabela 802; ISS campo 231 quando o salão é do município 563).
        Para a web falta: a rota <code>POST /fiscal/nota-servico</code> na API (lançamento) e o robô rodando como serviço num PC da PHD. Até lá, emita pelo Access.
      </div>
    </Modal>
  );
}
