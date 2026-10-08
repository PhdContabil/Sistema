"use client";

// O.S. do MEI = menuos + geraros + ostroca (+ ostrocamanutencao, OSGeral, OSFinanceiro).
// Regras de cobrança do Access (form ostroca):
//  - cobrança no Salão (cliente = salão do MEI) ou no Profissional (cliente = cód. financeiro dele);
//    se o profissional não tem empresa ativa no Questor, só pode ser no Profissional;
//  - serviço 72/102 no Salão herda o último valor fixo que o salão já paga; os demais vêm da tabela de preço;
//  - 72/102 => SERVICOFIXO mensal (todos os meses, reajuste 12, compldescr = "código - razão");
//    demais => SERVICOVARIAVEL (1 x valor, data = início dos trabalhos).
import { useEffect, useState } from "react";
import { api, ler, st, Campo, Mensagem, Tabela, brl, hojeISO, resumoGravacao, mensagemErro, AVULSO, type Mei } from "./ui";
import { gerarDocPdfOS, nomeArquivoPdfOS } from "@/components/apps/paralegal/os-pdf";

interface ClienteFin { codigocliente: number; nome: string; inscrfederal?: string; codigoempresa?: number | null; tipologradouro?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; nomemunic?: string | null; siglaestado?: string | null; cep?: string | null; telefone?: string | null; email?: string | null; baixado?: boolean }
interface ServEscrit { codigo: number; descricao: string; valor: number | null }
interface Fixo { codigocliente: number; codigoservicoescrit: number; valor: number; competinicialvalid: string | null; competfinalvalid: string | null }

const TIPOS = ["MEI", "Avulso", "Cancelamento", "Desenquadramento"];
const FIXOS = [72, 102];
const PERIODO = "1;2;3;4;5;6;7;8;9;10;11;12";

export default function OSMei({ mei }: { mei: Mei[] }) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ClienteFin[]>([]);
  const [cli, setCli] = useState<ClienteFin | null>(null);
  const [servicos, setServicos] = useState<ServEscrit[]>([]);
  const [os, setOs] = useState({ data: hojeISO(), tipo: "MEI", datainicio: hojeISO(), contato: "", indicacao: "", obs: "", cobranca: "profissional" as "salao" | "profissional", itens: [{ cod: "", valor: "" }, { cod: "", valor: "" }, { cod: "", valor: "" }, { cod: "", valor: "" }] });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [resultado, setResultado] = useState<string[]>([]);

  useEffect(() => {
    ler<{ dados: ServEscrit[] }>("/lookups/servicos", { q: "MEI -", limit: 500 })
      .then((j) => setServicos((j.dados ?? []).filter((s) => /^MEI\s*-/i.test(s.descricao)).sort((a, b) => a.descricao.localeCompare(b.descricao))))
      .catch((e) => setMsg({ ok: false, texto: e.message }));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = busca.trim();
      if (q.length < 3) { setAchados([]); return; }
      const dig = q.replace(/\D/g, "");
      const query: Record<string, unknown> = { incluir_empresas: true, incluir_baixados: false };
      if (dig.length >= 11) query.cpf_cnpj = dig; else if (/^\d+$/.test(q)) query.codigo = q; else query.nome = q;
      try { setAchados((await ler<{ dados: ClienteFin[] }>("/financeiro/clientes", query)).dados ?? []); } catch { setAchados([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const m = cli?.codigoempresa ? mei.find((x) => x.cod === cli.codigoempresa) : undefined;
  const temEmpresaAtiva = !!m?.ativo;
  const codSalao = m?.salaoCod && m.salaoCod !== AVULSO ? m.salaoCod : null;
  const podeSalao = temEmpresaAtiva && !!codSalao;
  const clienteCobrado = os.cobranca === "salao" && podeSalao ? codSalao! : cli?.codigocliente ?? null;
  const total = os.itens.reduce((a, i) => a + (Number(i.valor.replace(",", ".")) || 0), 0);

  async function escolherServico(idx: number, cod: string) {
    const itens = [...os.itens];
    itens[idx] = { cod, valor: "" };
    const s = servicos.find((x) => String(x.codigo) === cod);
    let valor = s?.valor ?? 0;
    if (FIXOS.includes(Number(cod)) && os.cobranca === "salao" && codSalao) {
      try {
        const j = await ler<{ dados: Fixo[] }>("/financeiro/servicos-fixos", { salao: codSalao });
        const L = (j.dados ?? []).filter((f) => f.codigoservicoescrit === Number(cod)).sort((a, b) => String(a.competinicialvalid).localeCompare(String(b.competinicialvalid)));
        if (L.length) valor = L[L.length - 1].valor;
      } catch { /* usa a tabela de preço */ }
    }
    itens[idx].valor = cod ? String(valor).replace(".", ",") : "";
    setOs({ ...os, itens });
  }

  async function validarCobranca() {
    if (!cli || !clienteCobrado) { setMsg({ ok: false, texto: "Escolha o cliente." }); return; }
    if (!os.datainicio || !cli.nomemunic) { setMsg({ ok: false, texto: "Cidade e início dos trabalhos são obrigatórios (regra do Access)." }); return; }
    if (!os.itens[0].cod) { setMsg({ ok: false, texto: "Informe ao menos o serviço 1." }); return; }
    const questor = cli.codigoempresa ?? "";
    const razao = cli.nome;
    const linhas: string[] = [];
    let ok = true;
    for (const [i, it] of os.itens.entries()) {
      const valor = Number(it.valor.replace(",", ".")) || 0;
      if (!it.cod || (i > 0 && valor <= 0)) continue;
      const cod = Number(it.cod);
      const r = FIXOS.includes(cod)
        ? await api("POST", "/cadastro/servico-fixo", { corpo: { codigocliente: clienteCobrado, codigoservicoescrit: cod, competinicialvalid: os.datainicio, valorservicofixo: valor, periodoservicofixo: PERIODO, compldescr: i === 0 ? `${questor} - ${razao.slice(0, 40)}` : String(questor), observacaoservicofixo: `${questor} - ${razao}`.slice(0, 250), codigoescrit: 1, codigousuario: 19 }, idempotencia: `osmei-${clienteCobrado}-${cod}-${os.datainicio}-fixo` })
        : await api("POST", "/cadastro/servico-variavel", { corpo: { codigocliente: clienteCobrado, codigoservicoescrit: cod, dataservvar: os.datainicio, qtdadeservvar: 1, valorunitservvar: valor, observservvar: `${questor} - ${razao.slice(0, 40)}`, codigoescrit: 1, codigousuario: 19 }, idempotencia: `osmei-${clienteCobrado}-${cod}-${os.datainicio}-var` });
      const res = resumoGravacao(r);
      ok = ok && res.ok;
      linhas.push(`Serviço ${i + 1} (${cod}, ${FIXOS.includes(cod) ? "fixo mensal" : "variável"}, ${brl(valor)}): ${res.ok ? res.texto : mensagemErro(r)}`);
    }
    setResultado(linhas);
    setMsg({ ok, texto: ok ? "Cobrança validada no Questor." : "Algum lançamento foi recusado — veja abaixo." });
  }

  async function pdf(publico: "financeiro" | "geral") {
    if (!cli) return;
    const desc = (c: string) => { const s = servicos.find((x) => String(x.codigo) === c); return s ? `${s.codigo} - ${s.descricao}` : c; };
    const salaoTxt = codSalao ? `Profissional da Empresa: ${m?.salao}` : "AVULSO";
    const d = {
      id: "(nova)", codigo: String(cli.codigocliente), questor: String(cli.codigoempresa ?? ""), tipo: os.tipo, data: os.data, dataInicio: os.datainicio,
      razao: cli.nome, cnpj: cli.inscrfederal ?? "", logradouro: [cli.tipologradouro, cli.logradouro].filter(Boolean).join(" "), numero: cli.numero ?? "",
      complemento: cli.complemento ?? "", bairro: cli.bairro ?? "", cidade: cli.nomemunic ?? "", cep: cli.cep ?? "", contato: os.contato, telefone: cli.telefone ?? "",
      email: cli.email ?? "", servicos: os.itens.map((i) => (i.cod ? desc(i.cod) : "")) as [string, string, string, string],
      valoresServ: os.itens.map((i) => (i.cod ? Number(i.valor.replace(",", ".")) || 0 : null)) as [number | null, number | null, number | null, number | null],
      valorTT: total, obs: `${salaoTxt}${os.obs ? "\n" + os.obs : ""}`, obsGerais: os.obs, tratadoCom: os.contato,
      inscrEstadual: m?.ie, inscrMunicipal: m?.im, ativPrincipal: m?.cnae, regimeTributario: "MEI",
    };
    const doc = await gerarDocPdfOS(d, publico);
    doc.save(nomeArquivoPdfOS(d, publico));
  }

  return (
    <div>
      <div style={{ ...st.aviso, color: "var(--div)" }}>
        <b>Falta onde guardar a O.S. do MEI.</b> No Access ela é gravada na tabela <code>mei.osfinanceiro</code> (4.166 O.S., nº atual 4308, usada todo dia), que é diferente da lista do SharePoint usada pelo Paralegal. A API ainda não tem rotas para ler/gravar essa tabela (pedido A6: <code>/mei/os</code>). Por isso esta tela já monta a O.S., calcula e valida a cobrança no Questor (em simulação) e gera os PDFs, mas não lista nem salva O.S.
      </div>
      <div style={st.card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Cliente (cadastro financeiro)</h3>
        <Campo label="Pesquisar cliente"><input style={{ ...st.input, minWidth: 320 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome (3+ letras), CPF/CNPJ ou código financeiro" /></Campo>
        {achados.length > 0 && !cli && (
          <div style={{ marginTop: 10 }}>
            <Tabela cab={["Cód. fin.", "Nome", "CPF/CNPJ", "Cód. empresa", ""]} linhas={achados.slice(0, 30).map((c) => [c.codigocliente, c.nome, c.inscrfederal ?? "", c.codigoempresa ?? "—",
              <button key="s" style={st.btn} onClick={() => { setCli(c); setOs((o) => ({ ...o, cobranca: "profissional" })); }}>Selecionar</button>])} />
          </div>
        )}
        {cli && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <b>{cli.codigocliente} - {cli.nome}</b> · {cli.inscrfederal} · Cód. Questor {cli.codigoempresa ?? "—"} · {cli.nomemunic ?? "sem cidade"}{cli.siglaestado ? "/" + cli.siglaestado : ""}
            {m && <> · Salão: <b>{m.salao}</b>{m.bloqueado ? " · BLOQUEADO" : ""}</>}
            <button style={{ ...st.btn, marginLeft: 10 }} onClick={() => { setCli(null); setResultado([]); }}>Trocar</button>
          </div>
        )}
      </div>

      {cli && (
        <div style={st.card}>
          <div style={st.grid}>
            <Campo label="Data"><input type="date" style={st.input} value={os.data} onChange={(e) => setOs({ ...os, data: e.target.value })} /></Campo>
            <Campo label="Tipo"><select style={st.input} value={os.tipo} onChange={(e) => setOs({ ...os, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
            <Campo label="Início dos trabalhos *"><input type="date" style={st.input} value={os.datainicio} onChange={(e) => setOs({ ...os, datainicio: e.target.value })} /></Campo>
            <Campo label="Contato / tratado com"><input style={st.input} value={os.contato} onChange={(e) => setOs({ ...os, contato: e.target.value })} /></Campo>
            <Campo label="Indicação"><input style={st.input} value={os.indicacao} onChange={(e) => setOs({ ...os, indicacao: e.target.value })} /></Campo>
          </div>
          <div style={{ ...st.bar }}>
            <label style={{ fontSize: 13 }}><input type="radio" checked={os.cobranca === "salao"} disabled={!podeSalao} onChange={() => setOs({ ...os, cobranca: "salao" })} /> Cobrar no Salão{!podeSalao ? " (indisponível: sem empresa ativa ou sem salão)" : ` (${codSalao})`}</label>
            <label style={{ fontSize: 13 }}><input type="radio" checked={os.cobranca === "profissional"} onChange={() => setOs({ ...os, cobranca: "profissional" })} /> Cobrar no Profissional ({cli.codigocliente})</label>
          </div>
          {os.itens.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginBottom: 8 }}>
              <Campo label={`Serviço ${i + 1}${i === 0 ? " *" : ""}`}>
                <select style={st.input} value={it.cod} onChange={(e) => escolherServico(i, e.target.value)}>
                  <option value="">—</option>
                  {servicos.map((s) => <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.descricao}{FIXOS.includes(s.codigo) ? " (mensal)" : ""}</option>)}
                </select>
              </Campo>
              <Campo label="Valor"><input style={st.input} value={it.valor} onChange={(e) => { const itens = [...os.itens]; itens[i] = { ...it, valor: e.target.value }; setOs({ ...os, itens }); }} /></Campo>
            </div>
          ))}
          <p style={{ fontWeight: 600 }}>Total: {brl(total)}</p>
          <Campo label="Observações"><textarea style={{ ...st.input, minHeight: 70 }} value={os.obs} onChange={(e) => setOs({ ...os, obs: e.target.value })} /></Campo>
          <div style={{ ...st.bar, marginTop: 10 }}>
            <button style={st.btnP} onClick={validarCobranca}>Validar cobrança no Questor</button>
            <button style={st.btn} onClick={() => pdf("financeiro")}>PDF Financeiro</button>
            <button style={st.btn} onClick={() => pdf("geral")}>PDF Geral</button>
            <button style={st.btn} disabled title="Aguardando a rota /mei/os na API">Salvar O.S.</button>
          </div>
          <Mensagem msg={msg} />
          {resultado.map((l, i) => <p key={i} style={{ fontSize: 13, margin: "4px 0" }}>{l}</p>)}
          <div style={st.aviso}>Ao salvar, o Access também: manda o PDF “Financeiro” por e-mail para graciele@ e debora@, e se o tipo é MEI com CNPJ acrescenta a linha na planilha de criação de pastas (<code>T:\Nome pastas\nome_pastas.xlsx</code>). No Núcleo a planilha já é alimentada pelo script do phddc01 a partir da lista de O.S.; para o MEI isso entra junto com a rota /mei/os.</div>
        </div>
      )}
    </div>
  );
}
