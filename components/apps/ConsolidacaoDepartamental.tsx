"use client";

import { useMemo, useState } from "react";
import {
  montarLinhas, contarPendencias, somarTotais, formatBRLCurto, formatCNPJ,
  MESES_ABR, FLAG_LABEL,
  type EmpresaConsolidacao, type GruposContas, type SocioItem, type Flag,
} from "@/lib/contabil";

type FiltroPend = "todas" | "com" | "sem" | Flag;

export default function ConsolidacaoDepartamental({
  ano, anosDisponiveis, dados, grupos, socios, geradoEm, erroServidor,
}: {
  ano: number;
  anosDisponiveis: number[];
  dados: EmpresaConsolidacao[];
  grupos: GruposContas;
  socios: SocioItem[];
  geradoEm?: string | null;
  erroServidor: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [socio, setSocio] = useState("");
  const [pend, setPend] = useState<FiltroPend>("todas");
  const [sobre, setSobre] = useState(false);

  const linhas = useMemo(() => montarLinhas(dados), [dados]);
  const totais = useMemo(() => somarTotais(dados), [dados]);

  // sócio -> empresas. Aplicado igualmente aos três grupos, ao contrário do
  // Power BI, onde o relacionamento de receita está inativo.
  const nomesSocios = useMemo(() => {
    const s = new Set<string>();
    for (const x of socios) if (x.nomesocio) s.add(x.nomesocio);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [socios]);

  const empresasDoSocio = useMemo(() => {
    if (!socio) return null;
    const s = new Set<number>();
    for (const x of socios) if (x.nomesocio === socio) s.add(x.codigoempresa);
    return s;
  }, [socio, socios]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (empresasDoSocio && !empresasDoSocio.has(l.codigoempresa)) return false;
      if (pend === "com" && l.totalPendencias === 0) return false;
      if (pend === "sem" && l.totalPendencias > 0) return false;
      if (pend === "F" || pend === "R" || pend === "I") {
        if (!l.meses.some((m) => m.includes(pend))) return false;
      }
      if (!q) return true;
      return (
        (l.nome ?? "").toLowerCase().includes(q) ||
        (l.cnpj ?? "").includes(q) ||
        String(l.codigoempresa).includes(q)
      );
    });
  }, [linhas, busca, pend, empresasDoSocio]);

  const cont = useMemo(() => contarPendencias(filtradas), [filtradas]);

  function exportarExcel() {
    const cab = ["Código", "Empresa", "CNPJ", "Regime", ...MESES_ABR, "Total pendências"];
    const linhasCsv = filtradas.map((l) => [
      l.codigoempresa,
      l.nome ?? `Empresa #${l.codigoempresa}`,
      formatCNPJ(l.cnpj),
      l.regime ?? "",
      ...l.meses.map((f, i) => (l.comDados[i] ? f.join(" ") : "")),
      l.totalPendencias,
    ]);

    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const corpo = [cab, ...linhasCsv].map((r) => r.map(esc).join(";")).join("\r\n");

    // Cabeçalho de contexto: quem abrir o arquivo precisa saber o recorte.
    const meta = [
      `Consolidação Departamental - Núcleo Contábil`,
      `Ano;${ano}`,
      `Filtro sócio;${socio || "Todos"}`,
      `Filtro busca;${busca || "-"}`,
      `Empresas listadas;${filtradas.length}`,
      `Pendências;F=${cont.F} R=${cont.R} I=${cont.I}`,
      `Contas folha;${grupos.folha.join(" ")}`,
      `Contas receita;${grupos.receita.join(" ")}`,
      `Contas imposto;${grupos.imposto.join(" ")}`,
      `Extraído em;${new Date().toLocaleString("pt-BR")}`,
      "",
    ].join("\r\n");

    // BOM para o Excel reconhecer os acentos.
    const blob = new Blob(["﻿" + meta + corpo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consolidacao-departamental-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function irParaAno(a: number) {
    window.location.href = `/m/contabil/consolidacao?ano=${a}`;
  }

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}

      <div className="summary">
        <div className="card">
          <div className="k">Folha de pagamento</div>
          <div className="v num">R$ {formatBRLCurto(totais.folhaContabil)}</div>
          <div className="sub">contabilizado</div>
        </div>
        <div className="card">
          <div className="k">Receita</div>
          <div className="v num">R$ {formatBRLCurto(totais.receitaContabil)}</div>
          <div className="sub">contabilizado</div>
        </div>
        <div className="card">
          <div className="k">Imposto</div>
          <div className="v num">R$ {formatBRLCurto(totais.impostoContabil)}</div>
          <div className="sub">contabilizado</div>
        </div>
        <div className="card">
          <div className="k">Receita fiscal</div>
          <div className="v num">R$ {formatBRLCurto(totais.receitaFiscal)}</div>
          <div className="sub">notas de saída</div>
        </div>
        <div className="card div">
          <div className="k">Pendências</div>
          <div className="v num">{cont.total}</div>
          <div className="sub">{cont.empresas} empresas</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar empresa, CNPJ ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="sel" value={ano} onChange={(e) => irParaAno(Number(e.target.value))}>
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="sel wide" value={socio} onChange={(e) => setSocio(e.target.value)}>
          <option value="">Todos os sócios</option>
          {nomesSocios.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className={`chip ${pend === "todas" ? "on" : ""}`} onClick={() => setPend("todas")}>Todas</span>
        <span className={`chip ${pend === "com" ? "on" : ""}`} onClick={() => setPend("com")}>Com pendência</span>
        <span className={`chip ${pend === "sem" ? "on" : ""}`} onClick={() => setPend("sem")}>Sem pendência</span>
        <span className={`chip f ${pend === "F" ? "on" : ""}`} onClick={() => setPend("F")}>F {cont.F}</span>
        <span className={`chip r ${pend === "R" ? "on" : ""}`} onClick={() => setPend("R")}>R {cont.R}</span>
        <span className={`chip i ${pend === "I" ? "on" : ""}`} onClick={() => setPend("I")}>I {cont.I}</span>
        <button className="btn" onClick={exportarExcel}>↓ Excel</button>
        <button className="btn" onClick={() => setSobre(true)}>? Sobre</button>
        <span className="contador">{filtradas.length} de {linhas.length}</span>
      </div>

      <div className="legend">
        <span className="lg"><span className="fl f">F</span>{FLAG_LABEL.F}</span>
        <span className="lg"><span className="fl r">R</span>{FLAG_LABEL.R}</span>
        <span className="lg"><span className="fl i">I</span>{FLAG_LABEL.I}</span>
        <span className="lg" style={{ color: "var(--muted)" }}>
          célula vazia = nada pendente · cinza = sem movimento no mês
        </span>
      </div>

      <div className="table-wrap">
        <table className="grid consol">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              {MESES_ABR.map((m) => <th key={m} className="mes">{m}</th>)}
              <th className="c-res">Pend.</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={l.codigoempresa}>
                <td className="col-empresa">
                  <span className="emp-nome">{l.nome ?? `Empresa #${l.codigoempresa}`}</span>
                  <span className="cnpj">
                    <span className="codigo">#{l.codigoempresa}</span>
                    {l.cnpj ? ` · ${formatCNPJ(l.cnpj)}` : ""}
                    {l.regime ? ` · ${l.regime}` : ""}
                  </span>
                </td>
                {l.meses.map((flags, i) => (
                  <td key={i} className={`mes ${l.comDados[i] ? "" : "vazio"}`}>
                    {flags.map((f) => (
                      <span key={f} className={`fl ${f.toLowerCase()}`} title={FLAG_LABEL[f]}>{f}</span>
                    ))}
                  </td>
                ))}
                <td className="c-res">
                  {l.totalPendencias > 0
                    ? <strong className="res-div">{l.totalPendencias}</strong>
                    : <span className="dash">–</span>}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td className="loading" colSpan={14}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="footnote">
        A letra aparece quando o movimento existe e o lançamento contábil não.
        Passe o mouse na letra para ver o grupo. Use <strong>Sobre</strong> para ver as contas
        e a regra completa.
        {geradoEm && <> Dados apurados em {new Date(geradoEm).toLocaleString("pt-BR")}.</>}
      </p>

      {sobre && <Sobre grupos={grupos} ano={ano} onFechar={() => setSobre(false)} />}
    </>
  );
}

function Sobre({ grupos, ano, onFechar }: { grupos: GruposContas; ano: number; onFechar: () => void }) {
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Como esta tela é calculada</h2>
          <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <p>
            Esta tela aponta <strong>o que o escritório deixou de contabilizar</strong>. Para cada
            empresa e cada mês de {ano}, ela compara duas visões da mesma competência:
          </p>
          <ul>
            <li><strong>O que aconteceu</strong> — folha lançada no Departamento Pessoal e notas de saída no Fiscal.</li>
            <li><strong>O que foi contabilizado</strong> — lançamentos nas contas contábeis correspondentes.</li>
          </ul>
          <p>
            Quando existe movimento e <em>não</em> existe o lançamento contábil, a célula recebe uma letra.
            Célula vazia significa que está tudo lançado; célula cinza significa que não houve
            movimento nenhum naquele mês.
          </p>

          <h3>As três regras</h3>
          <table className="mini">
            <thead>
              <tr><th>Letra</th><th>Dispara quando</th><th>Fonte do movimento</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="fl f">F</span></td>
                <td>Há folha no DP, mas nenhum lançamento nas contas de folha</td>
                <td>Folha de pagamento</td>
              </tr>
              <tr>
                <td><span className="fl r">R</span></td>
                <td>Há notas de saída, mas nenhum lançamento nas contas de receita</td>
                <td>Notas fiscais de saída</td>
              </tr>
              <tr>
                <td><span className="fl i">I</span></td>
                <td>Há notas de saída, mas nenhum lançamento nas contas de imposto</td>
                <td>Notas fiscais de saída</td>
              </tr>
            </tbody>
          </table>

          <h3>Contas contábeis usadas</h3>
          <p className="nota">
            São as mesmas contas do relatório do Power BI. A lista vem da API a cada consulta —
            se o plano de contas mudar, esta tela acompanha.
          </p>
          <div className="contas">
            <div>
              <h4>Folha <span>(débito)</span></h4>
              <div className="chips">{grupos.folha.map((c) => <code key={c}>{c}</code>)}</div>
            </div>
            <div>
              <h4>Receita <span>(crédito)</span></h4>
              <div className="chips">{grupos.receita.map((c) => <code key={c}>{c}</code>)}</div>
            </div>
            <div>
              <h4>Imposto <span>(débito)</span></h4>
              <div className="chips">{grupos.imposto.map((c) => <code key={c}>{c}</code>)}</div>
            </div>
          </div>

          <h3>O que os cartões mostram</h3>
          <table className="mini">
            <thead><tr><th>Cartão</th><th>O que é</th></tr></thead>
            <tbody>
              <tr><td>Folha de pagamento</td><td>Soma dos lançamentos contábeis nas contas de folha</td></tr>
              <tr><td>Receita</td><td>Soma dos lançamentos contábeis nas contas de receita</td></tr>
              <tr><td>Imposto</td><td>Soma dos lançamentos contábeis nas contas de imposto</td></tr>
              <tr><td>Receita fiscal</td><td>Soma das notas de saída — é a base de comparação, não um lançamento contábil</td></tr>
            </tbody>
          </table>
          <p className="nota">
            É normal a <strong>Receita fiscal</strong> ser bem maior que a <strong>Receita</strong>:
            uma vem das notas emitidas e a outra do que foi escriturado. A diferença entre as duas
            é justamente o que as letras <span className="fl r">R</span> apontam.
          </p>

          <h3>Uma diferença em relação ao Power BI</h3>
          <p>
            O relatório original pergunta <em>"a soma dos lançamentos é diferente de zero?"</em>.
            Só que, na linguagem dele, zero e vazio são a mesma coisa — então uma empresa cujo
            movimento soma exatamente R$ 0,00 era tratada como se não tivesse movimento, e a
            pendência ficava invisível.
          </p>
          <p>
            Aqui a pergunta é <em>"existe lançamento?"</em>, usando a quantidade e não o valor.
            Por isso esta tela pode apontar pendências que o relatório antigo não mostrava.
            Elas são reais.
          </p>
          <p className="nota">
            O filtro de sócio também se comporta diferente: no Power BI ele não afetava a receita,
            o que tornava a coluna <span className="fl r">R</span> incorreta sempre que alguém
            filtrava por sócio. Aqui o filtro vale igualmente para os três grupos.
          </p>

          <h3>Origem dos dados</h3>
          <p className="nota">
            Tudo vem da API Questor, lida do banco em tempo real a cada abertura da tela —
            não há cópia intermediária nem agendamento de atualização. O botão
            <strong> Excel</strong> exporta exatamente as linhas filtradas na tela, junto com o
            recorte usado e a lista de contas.
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={onFechar}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
