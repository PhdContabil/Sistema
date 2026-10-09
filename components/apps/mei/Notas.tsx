"use client";

// Notas MEI (menu_mei): profissionais do salão, notas do período, Exportar Notas, Exportar DAS,
// relatório rel_notas e a tela de emissão (emitirnota).
import { useEffect, useMemo, useState } from "react";
import { api, ler, st, Tabela, Campo, Modal, SelectSalao, baixarCsv, imprimir, esc, brl, dt, primeiroDiaMes, ultimoDiaMes, hojeISO, mensagemErro, AVULSO, type Mei } from "./ui";

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
  const [d, setD] = useState({ data: data > hojeISO() ? hojeISO() : data, valor: "", numero: "", serie: "", obs: DISCRIMINACAO });
  const [robo, setRobo] = useState<{ id?: string; status: string; passos: { msg: string }[]; erro?: string } | null>(null);
  const [sugestao, setSugestao] = useState("");
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<{ r: ResultadoNota; simulacao: boolean } | null>(null);
  const [soSaida, setSoSaida] = useState(false);
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
    if (!m.salaoCnpj) { setErro("Salão sem CNPJ no cadastro — não dá para preencher o tomador."); return; }
    try { await fetch("http://localhost:3199/status"); } catch {
      setErro("O robô não está aberto neste computador. Abra \"iniciar-robo-nucleo.bat\" na pasta MEI System e tente de novo.");
      return;
    }
    setRobo({ status: "buscando senha", passos: [] });
    const rc = await fetch(`/api/mei/nota/credenciais?cod=${m.cod}`);
    const jc = await rc.json();
    if (!rc.ok) { setRobo(null); setErro(jc.error ?? "Falha ao buscar a senha."); return; }
    const r = await fetch("http://localhost:3199/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      cod: m.cod, razao: m.razao, data: d.data, valor, tomadorCnpj: m.salaoCnpj, descricao: d.obs,
      municipio: m.cidade, uf: m.uf, codigoativmunic: (m.ativMunic || "").split(" ")[0], creds: jc.creds,
    }) });
    const j = await r.json();
    if (!r.ok) { setRobo(null); setErro(j.erro ?? "O robô recusou."); return; }
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
        <button style={st.btnP} disabled={m.bloqueado || (!!robo && ["buscando senha", "preparando", "login", "preenchendo"].includes(robo.status))} onClick={preencherPortal}>1) Preencher no Emissor Nacional (robô)</button>
        {robo && <button style={st.btn} onClick={cancelarRobo}>Cancelar robô</button>}
        <button style={st.btn} disabled={enviando || m.bloqueado} onClick={() => lancar(true)}>{enviando ? "Lançando…" : "2) Lançar no Questor"}</button>
        <button style={st.btn} onClick={() => navigator.clipboard?.writeText(d.obs)}>Copiar discriminação</button>
        {soSaida && <button style={st.btnD} onClick={() => lancar(false)}>Lançar só a saída</button>}
      </div>
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      {robo && (
        <div style={{ ...st.card, marginTop: 10 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Robô: {({ "buscando senha": "buscando a senha…", preparando: "abrindo o Chrome…", login: "fazendo login…", preenchendo: "preenchendo a nota…", aguardando_confirmacao: "PRONTO — confira na janela do Chrome e clique em EMITIR lá. Depois informe o número da nota acima e lance no Questor.", erro: "erro", cancelada: "cancelado", fechada: "janela do Chrome fechada" } as Record<string, string>)[robo.status] ?? robo.status}</p>
          {robo.erro && <p style={{ color: "var(--div)", fontSize: 13 }}>{robo.erro}</p>}
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
