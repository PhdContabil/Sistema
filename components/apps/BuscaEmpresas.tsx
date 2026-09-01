"use client";

import { useMemo, useState } from "react";
import { normalizar, formatTamanho, iconeArquivo, type ItemSP } from "@/lib/empresas-sharepoint";
import { formatData } from "@/lib/datas";

interface Trilha { id: string; name: string; webUrl: string }

export default function BuscaEmpresas({
  driveId, empresas, erroServidor,
}: {
  driveId: string | null;
  empresas: ItemSP[];
  erroServidor: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [trilha, setTrilha] = useState<Trilha[]>([]);
  const [conteudo, setConteudo] = useState<ItemSP[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return empresas;
    return empresas.filter(
      (e) => normalizar(e.name).includes(q) || (e.grupo && normalizar(e.grupo.name).includes(q))
    );
  }, [empresas, busca]);

  async function abrirPasta(itemId: string, novaTrilha: Trilha[]) {
    if (!driveId) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(
        `/api/empresas/pastas?drive=${encodeURIComponent(driveId)}&item=${encodeURIComponent(itemId)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Não foi possível abrir a pasta."); return; }
      setConteudo(j.itens ?? []);
      setTrilha(novaTrilha);
    } catch {
      setErro("Falha de rede ao abrir a pasta.");
    } finally {
      setCarregando(false);
    }
  }

  function abrirEmpresa(e: ItemSP) {
    const t: Trilha[] = [];
    if (e.grupo) t.push({ id: e.grupo.id, name: e.grupo.name, webUrl: "" });
    t.push({ id: e.id, name: e.name, webUrl: e.webUrl });
    abrirPasta(e.id, t);
  }

  function voltarPara(indice: number) {
    if (indice < 0) { setConteudo(null); setTrilha([]); return; }
    abrirPasta(trilha[indice].id, trilha.slice(0, indice + 1));
  }

  const urlAtual = trilha.length > 0 ? trilha[trilha.length - 1].webUrl : null;

  if (erroServidor) {
    return <div className="banner error">{erroServidor}</div>;
  }

  // ------------------------------------------------- navegando numa pasta
  if (conteudo !== null) {
    return (
      <>
        {erro && <div className="banner error">{erro}</div>}

        <div className="toolbar">
          <button className="btn" onClick={() => voltarPara(-1)}>← Empresas</button>
          {trilha.map((t, i) => (
            <span key={t.id} className="trilha-item">
              <span className="sep">/</span>
              <button className="th-ord" onClick={() => voltarPara(i)}>{t.name}</button>
            </span>
          ))}
          {carregando && <span className="contador">Carregando…</span>}
          {urlAtual && (
            <a className="btn primary" href={urlAtual} target="_blank" rel="noreferrer"
               style={{ marginLeft: "auto" }}>
              Abrir no SharePoint ↗
            </a>
          )}
        </div>

        <div className="lista-sp">
          {conteudo.length === 0 && <div className="col-vazia">Pasta vazia.</div>}
          {conteudo.map((i) => (
            <div key={i.id} className="linha-sp">
              {i.ehPasta ? (
                <button
                  className="linha-sp-main"
                  onClick={() => abrirPasta(i.id, [...trilha, { id: i.id, name: i.name, webUrl: i.webUrl }])}
                >
                  <span className="ic-sp">📁</span>
                  <span className="meta-sp">
                    <span className="nm">{i.name}</span>
                    <span className="sub">
                      {i.qtdItens !== null && i.qtdItens !== undefined ? `${i.qtdItens} item(ns)` : "Pasta"}
                    </span>
                  </span>
                  <span className="sub">›</span>
                </button>
              ) : (
                <div className="linha-sp-main estatica">
                  <span className="ic-sp">{iconeArquivo(i.name)}</span>
                  <span className="meta-sp">
                    <span className="nm">{i.name}</span>
                    <span className="sub">
                      {formatTamanho(i.tamanho)}
                      {i.modificadoEm ? ` · ${formatData(i.modificadoEm)}` : ""}
                    </span>
                  </span>
                </div>
              )}
              <a className="link-sp" href={i.webUrl} target="_blank" rel="noreferrer"
                 title="Abrir no SharePoint">
                {i.ehPasta ? "SharePoint ↗" : "Abrir ↗"}
              </a>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ------------------------------------------------- lista de empresas
  return (
    <>
      {erro && <div className="banner error">{erro}</div>}

      <input
        className="busca-grande"
        placeholder="Pesquisar empresa pelo nome…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoFocus
      />
      <p className="nota" style={{ marginTop: 6 }}>
        {carregando
          ? "Abrindo…"
          : `${filtradas.length} empresa(s)${busca ? " encontrada(s)" : " no total"}. ` +
            "Clique para navegar nas pastas ou vá direto ao SharePoint."}
      </p>

      {filtradas.length === 0 ? (
        <div className="col-vazia">Nenhuma empresa encontrada para “{busca}”.</div>
      ) : (
        <div className="grade-empresas">
          {filtradas.map((e) => (
            <div key={e.id} className="cartao-empresa" onClick={() => abrirEmpresa(e)} role="button">
              <a
                className="link-sp canto"
                href={e.webUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                title="Abrir esta empresa no SharePoint"
              >
                SharePoint ↗
              </a>
              <span className="ic-sp">📁</span>
              <span className="nome-empresa">
                {e.name}
                {e.grupo && <span className="tag-grupo">{e.grupo.name}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
