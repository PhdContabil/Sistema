"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatarCnpj } from "./merge-format";

interface Empresa {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  ativa: boolean;
}

interface EmpresaDetalhe {
  [chave: string]: unknown;
}

function listaSocios(d: EmpresaDetalhe): Record<string, unknown>[] {
  const cand = d["socios"] ?? d["quadrosocietario"] ?? d["quadroSocietario"] ?? d["socio"];
  if (Array.isArray(cand)) return cand as Record<string, unknown>[];
  return [];
}

function listaServicos(d: EmpresaDetalhe): Record<string, unknown>[] {
  const cand = d["servicos"] ?? d["servicoscontratados"] ?? d["servico"];
  if (Array.isArray(cand)) return cand as Record<string, unknown>[];
  return [];
}

function campo(d: EmpresaDetalhe, ...chaves: string[]): string {
  for (const c of chaves) {
    const v = d[c];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "-";
}

function formatarDataBr(v: unknown): string {
  if (!v) return "-";
  const s = String(v);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

interface EmpresasTabProps {
  // Chamado ao clicar em "Recadastrar" no detalhe — o pai (Controle) decide o
  // que fazer (aqui: abrir a aba Clientes já com um novo cadastro pré-preenchido).
  onRecadastrar?: (dados: { nome: string; empresa: string; cnpj: string }) => void;
}

export default function EmpresasTab({ onRecadastrar }: EmpresasTabProps) {
  const [itens, setItens] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [detalhe, setDetalhe] = useState<{ codigo: number; carregando: boolean; dados: EmpresaDetalhe | null; erro: string | null } | null>(null);
  const [verBruto, setVerBruto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/empresas", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao carregar empresas."); return; }
      setItens(j.itens ?? []);
    } catch {
      setErro("Falha de rede ao carregar empresas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Só refiltra 250ms depois da última tecla — evita recalcular/re-renderizar
  // a cada letra digitada quando o cadastro tem milhares de empresas.
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  const filtrados = useMemo(() => {
    const q = buscaDebounced.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((e) =>
      (e.nome ?? "").toLowerCase().includes(q) || (e.cnpj ?? "").includes(q) || String(e.codigoempresa).includes(q)
    );
  }, [itens, buscaDebounced]);

  const visiveis = useMemo(() => filtrados.slice(0, 300), [filtrados]);

  async function abrirDetalhe(codigo: number) {
    setVerBruto(false);
    setDetalhe({ codigo, carregando: true, dados: null, erro: null });
    try {
      const r = await fetch(`/api/paralegal/empresas/${codigo}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setDetalhe({ codigo, carregando: false, dados: null, erro: j.error ?? "Falha ao consultar." }); return; }
      setDetalhe({ codigo, carregando: false, dados: j.empresa, erro: null });
    } catch {
      setDetalhe({ codigo, carregando: false, dados: null, erro: "Falha de rede ao consultar." });
    }
  }

  return (
    <div>
      <div className="pl-toolbar">
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="pl-btn" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}
      <div className="pl-banner">Cadastro direto do Questor — clique numa linha para ver o detalhe. Só consulta, sem edição aqui.</div>

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <colgroup>
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 170 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e) => (
              <tr key={e.codigoempresa} onClick={() => abrirDetalhe(e.codigoempresa)} style={{ cursor: "pointer" }}>
                <td>{e.codigoempresa}</td>
                <td>{e.nome ?? "—"}</td>
                <td>{formatarCnpj(e.cnpj) || "—"}</td>
                <td>{e.ativa ? "Ativa" : "Encerrada"}</td>
              </tr>
            ))}
            {!carregando && visiveis.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--pl-ink-soft)" }}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtrados.length > 300 && (
        <div className="pl-banner" style={{ marginTop: 10 }}>Mostrando as primeiras 300 de {filtrados.length} — refine a busca.</div>
      )}

      {detalhe && (
        <div className="pl-modal-bg" onClick={() => setDetalhe(null)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            {detalhe.carregando && <p>Carregando…</p>}
            {detalhe.erro && <div className="pl-banner error">{detalhe.erro}</div>}
            {detalhe.dados && (
              <>
                <h3>{campo(detalhe.dados, "nomeempresa", "nome")}</h3>
                <p style={{ color: "var(--pl-ink-soft)", fontSize: 12.5, marginTop: -8, marginBottom: 16 }}>
                  Código {detalhe.codigo} · {formatarCnpj(campo(detalhe.dados, "inscrfederal", "cnpj"))}
                </p>

                <h3 style={{ fontSize: 12 }}>Dados cadastrais</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: 16, fontSize: 13.5 }}>
                  <div><strong>Natureza jurídica</strong><br />{campo(detalhe.dados, "naturjuridica", "naturezajuridica", "descnaturezajuridica")}</div>
                  <div><strong>Atividade (CNAE)</strong><br />{campo(detalhe.dados, "ativfederal", "atividadefederal", "cnae", "descatividade")}</div>
                  <div><strong>Início da atividade</strong><br />{formatarDataBr(detalhe.dados["datainicioativ"] ?? detalhe.dados["iniciodaatividade"] ?? detalhe.dados["dtinicioatividade"])}</div>
                  <div><strong>Data de registro</strong><br />{formatarDataBr(detalhe.dados["dataregist"] ?? detalhe.dados["dataregistro"] ?? detalhe.dados["dtregistro"])}</div>
                  <div><strong>Porte da empresa</strong><br />{campo(detalhe.dados, "regime", "porteempresa", "porte")}</div>
                  <div><strong>Capital social</strong><br />{campo(detalhe.dados, "capitalsocial")}</div>
                  <div><strong>Valor nominal da cota</strong><br />{campo(detalhe.dados, "valornominalcotas")}</div>
                </div>

                <h3 style={{ fontSize: 12 }}>Endereço</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 13.5 }}>
                  <div><strong>Logradouro</strong><br />{campo(detalhe.dados, "tipologradouro")} {campo(detalhe.dados, "enderecoestab", "endereco")}</div>
                  <div><strong>Número</strong><br />{campo(detalhe.dados, "numenderestab", "numero")}</div>
                  <div><strong>Complemento</strong><br />{campo(detalhe.dados, "complenderestab", "complemento")}</div>
                  <div><strong>Bairro</strong><br />{campo(detalhe.dados, "bairroenderestab", "bairro")}</div>
                  <div><strong>Município/UF</strong><br />{campo(detalhe.dados, "nomemunic", "cidade")} / {campo(detalhe.dados, "siglaestado", "uf")}</div>
                  <div><strong>CEP</strong><br />{campo(detalhe.dados, "cependerestab", "cep")}</div>
                  <div><strong>Telefone</strong><br />{campo(detalhe.dados, "telefone", "ddi", "numerofone")}</div>
                  <div><strong>E-mail</strong><br />{campo(detalhe.dados, "email")}</div>
                </div>

                <h3 style={{ fontSize: 12 }}>Sócios</h3>
                {listaSocios(detalhe.dados).length === 0 ? (
                  <p style={{ fontSize: 13.5, color: "var(--pl-ink-soft)", marginBottom: 16 }}>Nenhum sócio informado nesta consulta.</p>
                ) : (
                  <div className="pl-table-wrap" style={{ marginBottom: 16 }}>
                    <table className="pl-grid">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>CPF</th>
                          <th>Cargo</th>
                          <th>% Cotas</th>
                          <th>Qtd Cotas</th>
                          <th>Entrada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaSocios(detalhe.dados).map((s, i) => (
                          <tr key={i}>
                            <td>{campo(s, "nomesocio", "nome")}</td>
                            <td>{campo(s, "inscrfederal", "cpf", "numcpf")}</td>
                            <td>{campo(s, "cargo", "funcao", "qualificacao")}</td>
                            <td>{campo(s, "percentcotas", "percentualcotas", "percapital", "percentual")}</td>
                            <td>{campo(s, "quantcotas", "qtdcotas", "quantidadecotas", "qtdecotas")}</td>
                            <td>{formatarDataBr(s["datainiciosocio"] ?? s["dataentrada"] ?? s["entrada"] ?? s["dtentrada"])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 style={{ fontSize: 12 }}>Serviços contratados</h3>
                {listaServicos(detalhe.dados).length === 0 ? (
                  <p style={{ fontSize: 13.5, color: "var(--pl-ink-soft)", marginBottom: 8 }}>Nenhum serviço fixo informado nesta consulta.</p>
                ) : (
                  <ul style={{ fontSize: 13.5, marginBottom: 8, paddingLeft: 18 }}>
                    {listaServicos(detalhe.dados).map((s, i) => (
                      <li key={i}>
                        {campo(s, "descricao", "descrservicoescrit", "nome")}
                        {campo(s, "valor", "valorservicofixo") !== "-" && ` — R$ ${campo(s, "valor", "valorservicofixo")}`}
                        {campo(s, "periodicidade") !== "-" && ` (${campo(s, "periodicidade")})`}
                      </li>
                    ))}
                  </ul>
                )}

                <details style={{ marginTop: 16 }} onToggle={(e) => setVerBruto((e.target as HTMLDetailsElement).open)}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--pl-ink-soft)" }}>
                    {verBruto ? "▾" : "▸"} Ver dados brutos da API (debug)
                  </summary>
                  {verBruto && (
                    <pre style={{ fontSize: 11, maxHeight: 260, overflow: "auto", background: "var(--pl-bg, #f6f7fb)", padding: 10, borderRadius: 8, marginTop: 8 }}>
                      {JSON.stringify(detalhe.dados, null, 2)}
                    </pre>
                  )}
                </details>
              </>
            )}
            <div className="pl-toolbar" style={{ marginTop: 16 }}>
              {detalhe.dados && onRecadastrar && (
                <button
                  className="pl-btn"
                  title="Abre um novo cadastro de cliente pré-preenchido com os dados desta empresa"
                  onClick={() => {
                    const dados = detalhe.dados!;
                    const fantasia = campo(dados, "nomefantasia");
                    const razao = campo(dados, "nomeempresa", "nome");
                    onRecadastrar({
                      // nomefantasia às vezes vem mascarado ("********") pela API — nesse caso não preenche.
                      nome: fantasia !== "-" && !/^\*+$/.test(fantasia) ? fantasia : "",
                      empresa: razao !== "-" ? razao : "",
                      cnpj: formatarCnpj(campo(dados, "inscrfederal", "cnpj")) !== "-" ? formatarCnpj(campo(dados, "inscrfederal", "cnpj")) : "",
                    });
                    setDetalhe(null);
                  }}
                >
                  Recadastrar (novo cadastro com esses dados)
                </button>
              )}
              <button className="pl-btn" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
