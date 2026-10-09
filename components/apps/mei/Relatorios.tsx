"use client";

// Relatórios: Dados MEI (Exportar Clientes / Con_completa), Valores Mensal (consultavalor +
// report Servicosalao) e Salão x MEI (report Con_RelatorioMEISalao).
import { useState } from "react";
import { st, Tabela, Campo, SelectSalao, baixarCsv, imprimir, esc, brl, dt, hojeISO, primeiroDiaMes, situacao, type Mei } from "./ui";

export function DadosMei({ mei }: { mei: Mei[] }) {
  const [sit, setSit] = useState("Ativos");
  const [sal, setSal] = useState("");
  const [q, setQ] = useState("");
  const L = mei.filter((m) => (sit === "Todos" || (sit === "Ativos") === m.ativo) && (!sal || String(m.salaoCod) === sal)
    && (m.razao + " " + m.cnpj + " " + m.cod).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.razao.localeCompare(b.razao));
  const cab = ["Cód.", "Razão social", "CNPJ", "Salão", "Endereço", "Complemento", "Bairro", "Cidade", "UF", "CEP", "Início atividade", "I.E.", "I.M.",
    "Ativ. federal", "Ativ. municipal", "CPF sócio", "RG", "Nascimento", "Título eleitor", "Nome da mãe", "Celular", "E-mail", "Situação", "Bloqueio", "Mensalidade"];
  const linha = (m: Mei) => [m.cod, m.razao, m.cnpj, m.salao, m.endereco, m.compl, m.bairro, m.cidade, m.uf, m.cep, dt(m.inicio), m.ie, m.im,
    m.cnae, m.ativMunic, m.cpf, m.rg, dt(m.nasc), m.titulo, m.mae, m.whats || m.cel, m.email, situacao(m), m.bloqueado ? "BLOQUEADO" : "", m.mensal ? String(m.mensal).replace(".", ",") : ""];
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={st.input} value={q} onChange={(e) => setQ(e.target.value)} /></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Ativos", "Inativos", "Todos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <button style={st.btnP} onClick={() => baixarCsv("dados_mei.csv", cab, L.map(linha))}>Exportar (CSV/Excel)</button>
      </div>
      <Tabela total={L.length} cab={["Cód.", "Razão", "CNPJ", "Salão", "Cidade", "I.E.", "I.M.", "CPF sócio", "E-mail", "Situação", "Bloqueio"]}
        linhas={L.slice(0, 200).map((m) => [m.cod, m.razao, m.cnpj, m.salao, m.cidade, m.ie, m.im, m.cpf, m.email, situacao(m), m.bloqueado ? "BLOQUEADO" : ""])} />
    </div>
  );
}

export function ValoresMensal({ mei }: { mei: Mei[] }) {
  const [sal, setSal] = useState("");
  // Regra do Access (subvaloresMei / Servicosalao): por salão e tipo (NF ou não), o MAIOR valor vigente > 0, só MEI ativo.
  const grupos = new Map<string, { salao: string; tipo: string; valor: number; qtd: number }>();
  for (const m of mei) {
    if (!m.ativo || !m.mensal) continue;
    if (sal && String(m.salaoCod) !== sal) continue;
    const tipo = m.mensalNF ? "NF" : "";
    const k = `${m.salao}|${tipo}`;
    const g = grupos.get(k) ?? { salao: m.salao, tipo, valor: 0, qtd: 0 };
    g.valor = Math.max(g.valor, m.mensal); g.qtd++;
    grupos.set(k, g);
  }
  const L = [...grupos.values()].sort((a, b) => a.salao.localeCompare(b.salao));
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <button style={st.btn} onClick={() => imprimir("Valores Mensalidade", `<table><tr><th>Salão</th><th class="dir">Valor</th><th>Tipo</th></tr>${L.map((g) => `<tr><td>${esc(g.salao)}</td><td class="dir">${brl(g.valor)}</td><td>${g.tipo}</td></tr>`).join("")}</table>`)}>Imprimir</button>
      </div>
      <Tabela cab={["Salão", "Valor", "Tipo", "MEIs"]} linhas={L.map((g) => [g.salao, brl(g.valor), g.tipo, g.qtd])} />
    </div>
  );
}

export function SalaoMei({ mei }: { mei: Mei[] }) {
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(hojeISO());
  const [sal, setSal] = useState("");
  // Regra do botão "Salão x MEI": DATAINICIOATIV <= fim E DATAENCERATIV >= início (ativo em algum momento do período).
  const L = mei.filter((m) => (m.inicio ?? "") <= ate && (m.fim ?? "9999") >= de && (!sal || String(m.salaoCod) === sal))
    .sort((a, b) => a.salao.localeCompare(b.salao) || a.cod - b.cod);
  const grupos = new Map<string, Mei[]>();
  for (const m of L) grupos.set(m.salao, [...(grupos.get(m.salao) ?? []), m]);
  function imp() {
    const html = [...grupos].map(([s, ms]) => `<h2>${esc(s)} — ${ms.length} MEI(s)</h2><table><tr><th>Cód.</th><th>MEI</th><th>Início</th><th>Encerramento</th></tr>${ms.map((m) => `<tr><td>${m.cod}</td><td>${esc(m.razao)}</td><td>${dt(m.inicio)}</td><td>${m.ativo ? "" : dt(m.fim)}</td></tr>`).join("")}</table>`).join("");
    imprimir(`Clientes MEI por salão — ${dt(de)} a ${dt(ate)}`, html + `<p><b>Total: ${L.length}</b></p>`);
  }
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Data inicial"><input type="date" style={st.input} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo label="Data final"><input type="date" style={st.input} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <button style={st.btnP} onClick={imp}>Imprimir</button>
        <button style={st.btn} onClick={() => baixarCsv("salao_x_mei.csv", ["Salão", "Cód.", "MEI", "CNPJ", "Início", "Encerramento"], L.map((m) => [m.salao, m.cod, m.razao, m.cnpj, dt(m.inicio), m.ativo ? "" : dt(m.fim)]))}>Exportar CSV</button>
        <span style={st.mut}>{L.length} MEI(s) em {grupos.size} salão(ões)</span>
      </div>
      <Tabela cab={["Salão", "Qtd."]} linhas={[...grupos].map(([s, ms]) => [s, ms.length])} />
    </div>
  );
}
