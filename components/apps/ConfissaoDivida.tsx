"use client";

import { useMemo, useRef, useState } from "react";
import type { EmpresaCadastro } from "@/lib/questor";
import { formatCNPJ } from "@/lib/conciliacao";
import {
  competenciaValida, dataDeHoje, formatBRL, montarBlocosTermo, paraCentavos, pendenciasDoTermo,
  linhasValidas, podeGerarTermo,
  type Devedor, type EmpresaDoTermo, type EntradaTermo, type LinhaBoleto,
} from "@/lib/confissao-divida";
import { gerarPdfTermo, nomeArquivoTermo } from "./confissao-divida-pdf";

const LIMITE_LISTA = 100;

export default function ConfissaoDivida({
  empresas,
  erroServidor,
}: {
  empresas: EmpresaCadastro[];
  erroServidor: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<EmpresaDoTermo[]>([]);
  const [pct, setPct] = useState("30");
  const [parcelas, setParcelas] = useState("10");
  const [devedor, setDevedor] = useState<Devedor>({ nome: "", nacionalidade: "", profissao: "", endereco: "" });
  const [devTocado, setDevTocado] = useState(false);
  const [testemunhas, setTestemunhas] = useState<[string, string]>(["", ""]);
  const [dataIso, setDataIso] = useState(dataDeHoje());
  const [aviso, setAviso] = useState<string | null>(null);
  const seq = useRef(1);

  const novaLinha = (o: Partial<LinhaBoleto> = {}): LinhaBoleto => ({
    id: "l" + seq.current++, descricao: "Mensalidade", competencia: "", valor: "", ...o,
  });

  const marcadas = useMemo(() => new Set(escolhidas.map((e) => e.codigoempresa)), [escolhidas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return empresas.filter((e) => {
      if (!q) return true;
      return (
        (e.nome ?? "").toLowerCase().includes(q) ||
        String(e.codigoempresa).includes(q) ||
        (qd.length > 0 && (e.cnpj ?? "").replace(/\D/g, "").includes(qd))
      );
    });
  }, [empresas, busca]);

  const entrada: EntradaTermo = {
    empresas: escolhidas,
    pct: Number(pct) || 0,
    parcelas: Number(parcelas) || 1,
    devedor,
    testemunhas,
    dataIso,
  };
  const { blocos, acordo } = useMemo(() => montarBlocosTermo(entrada), [escolhidas, pct, parcelas, devedor, testemunhas, dataIso]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendencias = pendenciasDoTermo(entrada);
  const podeGerar = podeGerarTermo(entrada);

  async function sugerirDevedor(cod: number) {
    try {
      const r = await fetch(`/api/financeiro/confissao-divida/devedor?codigoempresa=${cod}`);
      const j = await r.json();
      if (r.ok && j.nome) setDevedor((d) => (d.nome ? d : { ...d, nome: String(j.nome) }));
    } catch { /* sem sugestão: a pessoa digita */ }
  }

  function alternar(e: EmpresaCadastro) {
    setAviso(null);
    if (marcadas.has(e.codigoempresa)) {
      setEscolhidas((l) => l.filter((x) => x.codigoempresa !== e.codigoempresa));
      return;
    }
    const primeira = escolhidas.length === 0;
    setEscolhidas((l) => [...l, { codigoempresa: e.codigoempresa, nome: e.nome ?? `Empresa ${e.codigoempresa}`, cnpj: e.cnpj, linhas: [novaLinha()] }]);
    if (primeira && !devTocado) void sugerirDevedor(e.codigoempresa);
  }

  const mexer = (cod: number, f: (ls: LinhaBoleto[]) => LinhaBoleto[]) =>
    setEscolhidas((l) => l.map((x) => (x.codigoempresa === cod ? { ...x, linhas: f(x.linhas) } : x)));

  function gerarMeses(cod: number, de: string, ate: string, valor: string, descricao: string) {
    if (!competenciaValida(de) || !competenciaValida(ate) || ate < de || !paraCentavos(valor)) {
      setAviso("Para gerar os meses, informe De, Até (AAAA-MM) e um valor mensal maior que zero.");
      return false;
    }
    setAviso(null);
    mexer(cod, (ls) => {
      const base = ls.filter((l) => l.competencia || l.valor);
      let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
      const fim = Number(ate.slice(0, 4)) * 12 + Number(ate.slice(5, 7));
      const novas: LinhaBoleto[] = [];
      while (a * 12 + m <= fim && novas.length < 60) {
        novas.push(novaLinha({ descricao: descricao.trim() || "Mensalidade", competencia: `${a}-${String(m).padStart(2, "0")}`, valor }));
        m++; if (m > 12) { m = 1; a++; }
      }
      return [...base, ...novas];
    });
    return true;
  }

  function baixarPdf() {
    if (!podeGerar) return;
    const doc = gerarPdfTermo(blocos);
    doc.save(nomeArquivoTermo(devedor.nome, dataIso));
  }

  const campoDev = (k: keyof Devedor) => (v: string) => { setDevTocado(true); setDevedor((d) => ({ ...d, [k]: v })); };

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      <div className="banner">
        Os boletos em aberto são digitados aqui, copiando do relatório <b>Inadimplentes e Contas a Receber</b> do Questor Financeiro.
        Confira os valores com o relatório antes de assinar.
      </div>

      <div className="cd-grid">
        <div className="cd-passos">
          <section className="cd-passo">
            <h2><span className="cd-n">1</span>Empresas</h2>
            <p className="cd-dica">Todas as empresas do cadastro do Questor. Marque quem entra no termo.</p>
            <input className="search" style={{ width: "100%" }} type="search" placeholder="Buscar por nome, CNPJ ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="cd-contagem">
              {escolhidas.length > 0 && <>{escolhidas.length} {escolhidas.length === 1 ? "selecionada" : "selecionadas"} · </>}
              {lista.length} {lista.length === 1 ? "empresa" : "empresas"}
              {escolhidas.length > 0 && <button type="button" className="cd-link" onClick={() => setEscolhidas([])}>Limpar seleção</button>}
            </div>
            <div className="cd-lista">
              {lista.slice(0, LIMITE_LISTA).map((e) => (
                <label key={e.codigoempresa} className={"cd-empresa" + (marcadas.has(e.codigoempresa) ? " on" : "")}>
                  <input type="checkbox" checked={marcadas.has(e.codigoempresa)} onChange={() => alternar(e)} />
                  <span>
                    <span className="cd-nome">{e.nome ?? `Empresa ${e.codigoempresa}`}{!e.ativa && <span className="cd-tag">encerrada</span>}</span>
                    <span className="cd-cnpj mono">{e.cnpj ? formatCNPJ(e.cnpj) : "sem CNPJ"} · cód. {e.codigoempresa}</span>
                  </span>
                </label>
              ))}
              {lista.length === 0 && <div className="cd-vazio">Nenhuma empresa encontrada.</div>}
              {lista.length > LIMITE_LISTA && <div className="cd-vazio">Mostrando {LIMITE_LISTA} de {lista.length}. Refine a busca.</div>}
            </div>
          </section>

          <section className="cd-passo">
            <h2><span className="cd-n">2</span>Boletos em aberto</h2>
            <p className="cd-dica">Descrição, competência (mês) e valor de cada boleto. Linhas incompletas ficam fora do termo.</p>
            {aviso && <div className="banner error">{aviso}</div>}
            {escolhidas.length === 0 && <div className="cd-vazio">Marque uma empresa no passo 1 para digitar os boletos.</div>}
            {escolhidas.map((emp) => (
              <BlocoEmpresa key={emp.codigoempresa} emp={emp}
                onAdd={() => mexer(emp.codigoempresa, (ls) => [...ls, novaLinha()])}
                onDel={(id) => mexer(emp.codigoempresa, (ls) => { const r = ls.filter((l) => l.id !== id); return r.length ? r : [novaLinha()]; })}
                onEdit={(id, campo, v) => mexer(emp.codigoempresa, (ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l)))}
                onGerar={(de, ate, valor, desc) => gerarMeses(emp.codigoempresa, de, ate, valor, desc)} />
            ))}
          </section>

          <section className="cd-passo">
            <h2><span className="cd-n">3</span>Acordo de dívidas</h2>
            <p className="cd-dica">Entrada e parcelas recalculam o termo na hora.</p>
            <div className="cd-duas">
              <label className="cd-campo">Entrada (%)<input className="search" type="number" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} /></label>
              <label className="cd-campo">Nº de parcelas<input className="search" type="number" min={1} max={60} step={1} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></label>
            </div>
            <div className="cd-resumo">
              <div className="card ok"><div className="k">Total da dívida</div><div className="v">{formatBRL(acordo.total)}</div></div>
              <div className="card"><div className="k">Entrada ({acordo.pct}%)</div><div className="v">{formatBRL(acordo.entrada)}</div></div>
              <div className="card"><div className="k">{acordo.parcelas}x de</div><div className="v">{formatBRL(acordo.parcela)}</div></div>
            </div>
            {acordo.parcelas > 1 && acordo.ultima !== acordo.parcela && (
              <div className="cd-dica" style={{ margin: "8px 0 0" }}>Arredondamento: a última parcela fica em {formatBRL(acordo.ultima)} para fechar o saldo exato.</div>
            )}
          </section>

          <section className="cd-passo">
            <h2><span className="cd-n">4</span>Devedor, testemunhas e data</h2>
            <p className="cd-dica">O nome do devedor é sugerido pelo primeiro sócio da primeira empresa marcada. Os demais campos são digitados.</p>
            <div className="cd-pilha">
              <label className="cd-campo">Nome do devedor<input className="search" value={devedor.nome} onChange={(e) => campoDev("nome")(e.target.value)} /></label>
              <div className="cd-duas">
                <label className="cd-campo">Nacionalidade<input className="search" placeholder="brasileiro(a)" value={devedor.nacionalidade} onChange={(e) => campoDev("nacionalidade")(e.target.value)} /></label>
                <label className="cd-campo">Profissão<input className="search" value={devedor.profissao} onChange={(e) => campoDev("profissao")(e.target.value)} /></label>
              </div>
              <label className="cd-campo">Endereço completo<input className="search" value={devedor.endereco} onChange={(e) => campoDev("endereco")(e.target.value)} /></label>
              <div className="cd-duas">
                <label className="cd-campo">Testemunha 1<input className="search" value={testemunhas[0]} onChange={(e) => setTestemunhas([e.target.value, testemunhas[1]])} /></label>
                <label className="cd-campo">Testemunha 2<input className="search" value={testemunhas[1]} onChange={(e) => setTestemunhas([testemunhas[0], e.target.value])} /></label>
              </div>
              <label className="cd-campo">Data do termo (padrão: hoje)<input className="search" type="date" value={dataIso} onChange={(e) => setDataIso(e.target.value || dataDeHoje())} /></label>
            </div>
          </section>
        </div>

        <aside className="cd-previa">
          <div className="cd-previa-topo">
            <span className="cd-dica" style={{ margin: 0 }}>Prévia do documento{escolhidas.length > 0 ? ` · ${escolhidas.length} ${escolhidas.length === 1 ? "empresa" : "empresas"}` : ""}</span>
            <button type="button" className="btn primary" disabled={!podeGerar} onClick={baixarPdf}>Baixar PDF</button>
          </div>
          {pendencias.length > 0 && (
            <div className="banner">
              Antes de gerar o PDF:
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          <div className="cd-caixa">
            <article className="cd-folha">
              {escolhidas.length === 0 ? (
                <p className="cd-folha-vazia">Marque as empresas do termo no passo 1.<br />O contrato aparece aqui.</p>
              ) : blocos.map((b, i) => {
                switch (b.t) {
                  case "title": return <h1 key={i}>{b.text}</h1>;
                  case "p": return <p key={i}>{b.text}</p>;
                  case "co": return <div key={i} className="co">• {b.text}</div>;
                  case "li": return <div key={i} className="li">{b.text}</div>;
                  case "tot": return <div key={i} className="tot">• {b.text}</div>;
                  case "dt": return <p key={i} className="dt">{b.text}</p>;
                  case "sign": return <div key={i} className="sign"><div>{b.l}</div><div>{b.r}</div></div>;
                }
              })}
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}

function BlocoEmpresa({
  emp, onAdd, onDel, onEdit, onGerar,
}: {
  emp: EmpresaDoTermo;
  onAdd: () => void;
  onDel: (id: string) => void;
  onEdit: (id: string, campo: "descricao" | "competencia" | "valor", v: string) => void;
  onGerar: (de: string, ate: string, valor: string, desc: string) => boolean;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [valor, setValor] = useState("");
  const [desc, setDesc] = useState("Mensalidade");
  const subtotal = linhasValidas(emp.linhas).reduce((s, l) => s + paraCentavos(l.valor), 0);

  return (
    <div className="cd-emp">
      <div className="cd-emp-topo"><h3>{emp.nome}</h3><span className="cd-sub">{formatBRL(subtotal)}</span></div>
      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="cd-tab">
          <thead><tr><th>Descrição</th><th>Competência</th><th style={{ textAlign: "right" }}>Valor (R$)</th><th /></tr></thead>
          <tbody>
            {emp.linhas.map((l) => (
              <tr key={l.id}>
                <td><input className="search" value={l.descricao} onChange={(e) => onEdit(l.id, "descricao", e.target.value)} aria-label="Descrição" /></td>
                <td><input className="search" type="month" value={l.competencia} onChange={(e) => onEdit(l.id, "competencia", e.target.value)} aria-label="Competência" /></td>
                <td><input className="search" style={{ textAlign: "right" }} inputMode="decimal" placeholder="0,00" value={l.valor}
                  aria-invalid={!!l.valor && !paraCentavos(l.valor)} onChange={(e) => onEdit(l.id, "valor", e.target.value)} aria-label="Valor" /></td>
                <td><button type="button" className="btn-remover" onClick={() => onDel(l.id)} aria-label="Remover linha">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="cd-link" onClick={onAdd}>+ Adicionar boleto</button>
      <details className="cd-gerar">
        <summary>Gerar vários meses de uma vez</summary>
        <div className="cd-gerar-campos">
          <label className="cd-campo">De<input className="search" type="month" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="cd-campo">Até<input className="search" type="month" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <label className="cd-campo">Valor mensal<input className="search" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          <label className="cd-campo">Descrição<input className="search" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <button type="button" className="btn" onClick={() => { if (onGerar(de, ate, valor, desc)) { setDe(""); setAte(""); setValor(""); } }}>Gerar meses</button>
        </div>
      </details>
    </div>
  );
}
