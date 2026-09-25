"use client";

import { useCallback, useEffect, useState } from "react";

interface Contrato {
  id: string;
  titulo: string;
  codigoEmpresa: string;
  cnpj: string;
  filial: string;
  socio: string;
  razaoSocial: string;
  contratoTexto: string;
  dataEmissao: string | null;
  dataInicio: string | null;
  dataAssinado: string | null;
  origem: string;
}

interface ModeloResumo { codigo: number; modelo: string; temTexto: boolean }

const VAZIO: Omit<Contrato, "id"> = {
  titulo: "", codigoEmpresa: "", cnpj: "", filial: "", socio: "", razaoSocial: "",
  contratoTexto: "", dataEmissao: null, dataInicio: null, dataAssinado: null, origem: "",
};

function abrirPdfContrato(textoHtml: string) {
  const janela = window.open("", "_blank");
  if (!janela) {
    alert("O navegador bloqueou a janela de impressão. Permita pop-ups para gerar o PDF.");
    return;
  }
  const cabecalho =
    '<table style="width:100%; border-collapse:collapse; margin-bottom:22px;"><tr>' +
    '<td style="width:20%;"></td>' +
    '<td style="width:60%; text-align:center; vertical-align:middle;"><h1 style="font-size:16px; font-weight:700; margin:0;">Contrato de Prestação de Serviços Contábeis</h1></td>' +
    '<td style="width:20%;"></td>' +
    "</tr></table>";
  janela.document.open();
  janela.document.write(
    '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>Contrato de Prestação de Serviços Contábeis</title><style>' +
    "@page { size: A4; margin: 2.3cm 2cm; } body { font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #111; line-height: 1.35; max-width: 800px; margin: 0 auto; padding: 0 6px; } .corpo-contrato, .corpo-contrato p, .corpo-contrato div { text-align: justify; } @media print { body { margin: 0; padding: 0; } }" +
    "</style></head><body>" + cabecalho + '<div class="corpo-contrato">' + textoHtml + "</div>" +
    "<script>window.onload = function(){ window.print(); };</script></body></html>"
  );
  janela.document.close();
}

export default function ContratosTab() {
  const [itens, setItens] = useState<Contrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [modelos, setModelos] = useState<ModeloResumo[]>([]);
  const [modal, setModal] = useState<null | { editando: Contrato | null; dados: Omit<Contrato, "id"> }>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [codigoModelo, setCodigoModelo] = useState("");
  const [dataModelo, setDataModelo] = useState("");
  const [valor1, setValor1] = useState("");
  const [valor2, setValor2] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/contratos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao carregar."); return; }
      setItens(j.itens ?? []);
    } catch {
      setErro("Falha de rede ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/paralegal/contratos/modelos").then((r) => r.json()).then((j) => setModelos(j.itens ?? [])).catch(() => {});
  }, []);

  const filtrados = itens.filter((c) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [c.titulo, c.razaoSocial, c.cnpj, c.socio].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  function abrirNovo() {
    setModal({ editando: null, dados: { ...VAZIO } });
    setCodigoModelo(""); setDataModelo(new Date().toISOString().slice(0, 10)); setValor1(""); setValor2("");
  }
  function abrirEdicao(c: Contrato) {
    const { id: _id, ...dados } = c;
    setModal({ editando: c, dados });
    setCodigoModelo(""); setDataModelo(new Date().toISOString().slice(0, 10)); setValor1(""); setValor2("");
  }

  function setCampo<K extends keyof Omit<Contrato, "id">>(chave: K, valor: Omit<Contrato, "id">[K]) {
    if (!modal) return;
    setModal({ ...modal, dados: { ...modal.dados, [chave]: valor } });
  }

  async function gerarDoModelo() {
    if (!modal) return;
    if (!codigoModelo) { setErro("Selecione um modelo."); return; }
    if (!modal.dados.codigoEmpresa.trim()) { setErro("Informe o código da empresa (Questor) antes de gerar o texto."); return; }
    setGerando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/contratos/gerar-texto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoModelo: Number(codigoModelo),
          codigoEmpresa: modal.dados.codigoEmpresa.trim(),
          dataIso: dataModelo,
          valor1, valor2,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao gerar o texto."); return; }
      setCampo("contratoTexto", j.texto);
      if (!modal.dados.razaoSocial.trim()) setCampo("razaoSocial", j.razaoSocial ?? "");
      if (!modal.dados.cnpj.trim()) setCampo("cnpj", j.cnpj ?? "");
    } catch {
      setErro("Falha de rede ao gerar o texto.");
    } finally {
      setGerando(false);
    }
  }

  async function salvar() {
    if (!modal) return;
    if (!modal.dados.titulo.trim()) { setErro("Título é obrigatório."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const editando = modal.editando;
      const r = await fetch(editando ? `/api/paralegal/contratos/${editando.id}` : "/api/paralegal/contratos", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal.dados),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao salvar."); return; }
      setModal(null);
      await carregar();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Contrato) {
    if (!confirm(`Excluir o contrato "${c.titulo}"?`)) return;
    try {
      const r = await fetch(`/api/paralegal/contratos/${c.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao excluir."); return; }
      await carregar();
    } catch {
      setErro("Falha de rede ao excluir.");
    }
  }

  return (
    <div>
      <div className="pl-toolbar">
        <input type="text" placeholder="Buscar por título, razão social, CNPJ ou sócio…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="pl-btn" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
        <button className="pl-btn primary" onClick={abrirNovo}>+ Novo contrato</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead><tr><th>Título</th><th>Razão social</th><th>CNPJ</th><th>Emissão</th><th></th></tr></thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td>{c.titulo}</td><td>{c.razaoSocial}</td><td>{c.cnpj}</td>
                <td>{c.dataEmissao ? new Date(c.dataEmissao).toLocaleDateString("pt-BR") : ""}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="pl-btn" onClick={() => abrirEdicao(c)}>Editar</button>{" "}
                  <button className="pl-btn danger" onClick={() => excluir(c)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!carregando && filtrados.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--pl-ink-soft)" }}>Nenhum contrato encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="pl-modal-bg" onClick={() => !salvando && setModal(null)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>{modal.editando ? "Editar contrato" : "Novo contrato"}</h3>

            <h3 style={{ fontSize: 13 }}>Gerar a partir de modelo</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <label style={{ marginBottom: 0 }}>
                <span>Modelo</span>
                <select value={codigoModelo} onChange={(e) => setCodigoModelo(e.target.value)} style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5 }}>
                  <option value="">Selecione um modelo...</option>
                  {modelos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.modelo}{m.temTexto ? "" : " (sem texto cadastrado)"}</option>
                  ))}
                </select>
              </label>
              <label style={{ marginBottom: 0 }}><span>Data</span><input type="date" value={dataModelo} onChange={(e) => setDataModelo(e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Valor 1</span><input type="number" step="0.01" value={valor1} onChange={(e) => setValor1(e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Valor 2</span><input type="number" step="0.01" value={valor2} onChange={(e) => setValor2(e.target.value)} /></label>
            </div>
            <button className="pl-btn" onClick={gerarDoModelo} disabled={gerando} style={{ marginBottom: 16 }}>
              {gerando ? "Gerando…" : "Gerar texto do modelo"}
            </button>

            <label><span>Título *</span><input value={modal.dados.titulo} onChange={(e) => setCampo("titulo", e.target.value)} /></label>
            <label><span>Código da empresa (Questor)</span><input value={modal.dados.codigoEmpresa} onChange={(e) => setCampo("codigoEmpresa", e.target.value)} /></label>
            <label><span>Razão social</span><input value={modal.dados.razaoSocial} onChange={(e) => setCampo("razaoSocial", e.target.value)} /></label>
            <label><span>CNPJ</span><input value={modal.dados.cnpj} onChange={(e) => setCampo("cnpj", e.target.value)} /></label>
            <label><span>Filial</span><input value={modal.dados.filial} onChange={(e) => setCampo("filial", e.target.value)} /></label>
            <label><span>Sócio</span><input value={modal.dados.socio} onChange={(e) => setCampo("socio", e.target.value)} /></label>
            <label><span>Data de emissão</span><input type="date" value={modal.dados.dataEmissao ?? ""} onChange={(e) => setCampo("dataEmissao", e.target.value || null)} /></label>
            <label><span>Data de início</span><input type="date" value={modal.dados.dataInicio ?? ""} onChange={(e) => setCampo("dataInicio", e.target.value || null)} /></label>
            <label><span>Data de assinatura</span><input type="date" value={modal.dados.dataAssinado ?? ""} onChange={(e) => setCampo("dataAssinado", e.target.value || null)} /></label>
            <label>
              <span>Texto do contrato</span>
              <textarea rows={10} style={{ fontFamily: "'Times New Roman', Times, serif" }} value={modal.dados.contratoTexto} onChange={(e) => setCampo("contratoTexto", e.target.value)} />
            </label>

            <div className="pl-toolbar" style={{ marginTop: 4 }}>
              <button className="pl-btn" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button className="pl-btn" onClick={() => abrirPdfContrato(modal.dados.contratoTexto.replace(/\n/g, "<br>"))} disabled={!modal.dados.contratoTexto}>Gerar PDF</button>
              <button className="pl-btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
