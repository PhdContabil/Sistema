"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gerarDocPdfOS, nomeArquivoPdfOS } from "./os-pdf";
import { formatarCnpj } from "./merge-format";

interface OS {
  id: string;
  titulo: string;
  data: string | null;
  codigo: string;
  tipo: string;
  questor: string;
  razao: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  cep: string;
  contato: string;
  email: string;
  telefone: string;
  celular: string;
  indicacao: string;
  tratadoCom: string;
  natJuridica: string;
  outraEmpresa: string;
  obs: string;
  usuario: string;
  dataInicio: string | null;
  servicos: [string, string, string, string];
  valoresServ: [number | null, number | null, number | null, number | null];
  valorTT: number | null;
  obsGerais: string;
}

interface EmpresaResumo { codigoempresa: number; nome: string | null; cnpj: string | null; ativa: boolean }
interface Indicacao { id: string; nome: string; telefone: string; celular: string; whatsapp: string }

const VAZIO: Omit<OS, "id"> = {
  titulo: "", data: null, codigo: "", tipo: "", questor: "", razao: "", cnpj: "",
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "",
  contato: "", email: "", telefone: "", celular: "", indicacao: "", tratadoCom: "",
  natJuridica: "", outraEmpresa: "", obs: "", usuario: "", dataInicio: null,
  servicos: ["", "", "", ""], valoresServ: [null, null, null, null], valorTT: null, obsGerais: "",
};

// Mesmas opções fixas do formulário original (generic-config.js do Paralegal System).
const TIPOS_OS = ["Abertura", "Alteração", "Cancelamento", "Doméstico", "Troca", "Avulso", "Novo Regime"];
const SERVICOS_OPCOES = ["Registro de Empresa", "Alteração Contratual", "Procuração", "Certidões", "Baixa de Empresa", "Licenças e Alvarás", "Legalização"];
const OUTRO_SERVICO = "Outro (especificar)";

function somenteDigitos(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

// Máscara progressiva de CNPJ — igual à do formulário original, aplicada
// enquanto o usuário digita (não exige os 14 dígitos completos).
function mascararCnpjDigitando(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 14);
  let out = digitos;
  if (digitos.length > 2) out = digitos.slice(0, 2) + "." + digitos.slice(2);
  if (digitos.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (digitos.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (digitos.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
}

function formatarValor(v: number | null): string {
  if (v === null || v === undefined) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OSTab() {
  const [itens, setItens] = useState<OS[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<null | { editando: OS | null; dados: Omit<OS, "id"> }>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [destinatario, setDestinatario] = useState<"geral" | "financeiro">("geral");

  // Busca de empresa (Questor) dentro do modal — mesmo padrão do "_buscaEmpresa"
  // do formulário original: digita, aparece uma lista, clica e autopreenche.
  const [empresas, setEmpresas] = useState<EmpresaResumo[]>([]);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [empresaAberta, setEmpresaAberta] = useState(false);
  const [carregandoEmpresaDetalhe, setCarregandoEmpresaDetalhe] = useState(false);

  // Busca de indicação já cadastrada — mesmo padrão do "indicacao-busca".
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [buscaIndicacao, setBuscaIndicacao] = useState("");
  const [indicacaoAberta, setIndicacaoAberta] = useState(false);

  // Para cada um dos 4 serviços: se está em modo "outro" (texto livre) — ativa
  // sozinho quando o valor salvo não bate com nenhuma opção fixa.
  const [servicoManual, setServicoManual] = useState<[boolean, boolean, boolean, boolean]>([false, false, false, false]);
  // Quantas linhas de serviço aparecem no formulário (começa com 1, "+ Adicionar" libera até 4).
  const [qtdServicos, setQtdServicos] = useState(1);

  // Nome do usuário logado — preenche sozinho Usuário/Tratado com numa OS nova.
  const [meuNome, setMeuNome] = useState("");

  const empresaBuscaRef = useRef<HTMLDivElement>(null);
  const indicacaoBuscaRef = useRef<HTMLDivElement>(null);
  // Evita buscar de novo o mesmo CNPJ (a própria seleção reescreve o campo já formatado).
  const cnpjJaBuscadoRef = useRef<string | null>(null);
  // Espelha `empresas` pra ler o valor mais atual dentro do efeito de CNPJ sem
  // precisar depender de `empresas` no array de dependências (evitaria reexecutar
  // a busca toda vez que a lista de empresas mudasse).
  const empresasRef = useRef<EmpresaResumo[]>([]);
  useEffect(() => { empresasRef.current = empresas; }, [empresas]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/os", { cache: "no-store" });
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

  // Fecha os dropdowns de busca ao clicar fora deles. Importante: usa "click"
  // (não "mousedown") — com mousedown o dropdown fecha ANTES do onClick do
  // item rodar (mousedown dispara primeiro), e a seleção nunca acontece.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (empresaBuscaRef.current && !empresaBuscaRef.current.contains(e.target as Node)) setEmpresaAberta(false);
      if (indicacaoBuscaRef.current && !indicacaoBuscaRef.current.contains(e.target as Node)) setIndicacaoAberta(false);
    }
    document.addEventListener("click", aoClicarFora);
    return () => document.removeEventListener("click", aoClicarFora);
  }, []);

  const filtrados = itens.filter((o) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const qDigitos = somenteDigitos(busca);
    if (qDigitos && qDigitos === busca.trim()) {
      if (somenteDigitos(o.codigo) === qDigitos || somenteDigitos(o.questor) === qDigitos) return true;
    }
    return [o.titulo, o.razao, o.cnpj, o.contato].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  const empresasFiltradas = useMemo(() => {
    const qDigitos = somenteDigitos(buscaEmpresa);
    const qMin = buscaEmpresa.trim().toLowerCase();
    if (!qMin) return [];
    return empresas
      .filter((e) => {
        const nome = (e.nome ?? "").toLowerCase();
        const cnpj = somenteDigitos(e.cnpj ?? "");
        const codigo = String(e.codigoempresa);
        if (qDigitos && codigo === qDigitos) return true;
        if (qDigitos && qDigitos.length >= 3) return cnpj.includes(qDigitos) || nome.includes(qMin);
        return nome.includes(qMin);
      })
      .slice(0, 20);
  }, [empresas, buscaEmpresa]);

  const indicacoesFiltradas = useMemo(() => {
    const qMin = buscaIndicacao.trim().toLowerCase();
    if (!qMin) return [];
    return indicacoes.filter((i) => i.nome.toLowerCase().includes(qMin)).slice(0, 20);
  }, [indicacoes, buscaIndicacao]);

  async function garantirEmpresasCarregadas() {
    if (empresas.length) return;
    try {
      const r = await fetch("/api/paralegal/empresas", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setEmpresas(j.itens ?? []);
    } catch {
      // busca de empresa fica indisponível, mas o resto do formulário funciona normalmente
    }
  }

  async function garantirIndicacoesCarregadas() {
    if (indicacoes.length) return;
    try {
      const r = await fetch("/api/paralegal/indicacoes", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setIndicacoes(j.itens ?? []);
    } catch {
      // idem — busca de indicação fica indisponível sem travar a OS
    }
  }

  // Próximo número de OS: maior valor já usado entre os campos "codigo" e
  // "questor" de todas as OS existentes, + 1 — mesma lógica do antigo
  // GET /api/os-proximo. Calculado a partir da lista já carregada na tela
  // (evita mais um round-trip); o campo continua um input normal, editável —
  // isso só sugere um valor de partida.
  //
  // LIMITE_RAZOAVEL: existe um lote de ~13 OS antigas (por volta do ID 914-933)
  // com o campo "codigo" corrompido em ~11.268.430 — dado ruim histórico, bem
  // fora da faixa normal (o resto da lista vai até uns 57 mil). Sem esse limite,
  // o cálculo "maior valor + 1" pega esse lixo e sugere um código absurdo.
  const LIMITE_RAZOAVEL = 200000;
  function proximoCodigo(): string {
    let maior = 0;
    for (const o of itens) {
      const nCodigo = parseInt(somenteDigitos(o.codigo), 10);
      if (!isNaN(nCodigo) && nCodigo > maior && nCodigo <= LIMITE_RAZOAVEL) maior = nCodigo;
      const nQuestor = parseInt(somenteDigitos(o.questor), 10);
      if (!isNaN(nQuestor) && nQuestor > maior && nQuestor <= LIMITE_RAZOAVEL) maior = nQuestor;
    }
    return String(maior + 1);
  }

  async function abrirNovo() {
    setModal({ editando: null, dados: { ...VAZIO, data: hoje(), codigo: proximoCodigo() } });
    setBuscaEmpresa(""); setBuscaIndicacao(""); setServicoManual([false, false, false, false]); setQtdServicos(1);
    cnpjJaBuscadoRef.current = null;
    garantirEmpresasCarregadas(); garantirIndicacoesCarregadas();
    try {
      let nome = meuNome;
      if (!nome) {
        const r = await fetch("/api/paralegal/eu", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && j.nome) { nome = j.nome; setMeuNome(j.nome); }
      }
      if (nome) { setCampo("usuario", nome); setCampo("tratadoCom", nome); }
    } catch {
      // sem nome disponível: campos ficam em branco, usuário preenche na mão
    }
  }
  function abrirEdicao(o: OS) {
    const { id: _id, ...dados } = o;
    setModal({ editando: o, dados });
    setBuscaEmpresa(""); setBuscaIndicacao("");
    // Já tem CNPJ salvo — não precisa (nem deve) disparar a busca automática de novo.
    cnpjJaBuscadoRef.current = somenteDigitos(dados.cnpj) || null;
    setServicoManual(dados.servicos.map((s) => !!s && !SERVICOS_OPCOES.includes(s)) as [boolean, boolean, boolean, boolean]);
    const ultimoPreenchido = dados.servicos.reduce((max, s, i) => (s ? i : max), 0);
    setQtdServicos(Math.min(4, Math.max(1, ultimoPreenchido + 1)));
    garantirEmpresasCarregadas(); garantirIndicacoesCarregadas();
  }

  async function selecionarEmpresa(emp: EmpresaResumo) {
    setEmpresaAberta(false);
    setBuscaEmpresa("");
    setCampo("questor", String(emp.codigoempresa));
    setCampo("razao", emp.nome ?? "");
    setCampo("cnpj", formatarCnpj(emp.cnpj) || emp.cnpj || "");

    // Busca os dados completos no Questor para preencher o resto sozinho —
    // mesmo comportamento do "aoSelecionarEmpresa" do formulário original.
    setCarregandoEmpresaDetalhe(true);
    try {
      const r = await fetch(`/api/paralegal/empresas/${emp.codigoempresa}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.empresa) {
        const d = j.empresa as Record<string, unknown>;
        const val = (...chaves: string[]) => {
          for (const c of chaves) {
            const v = d[c];
            if (v !== undefined && v !== null && v !== "") return String(v);
          }
          return "";
        };
        setModal((atual) => {
          if (!atual) return atual;
          const dados = { ...atual.dados };
          dados.natJuridica = dados.natJuridica || val("naturjuridica", "naturezajuridica");
          dados.logradouro = dados.logradouro || [val("tipologradouro"), val("enderecoestab", "endereco")].filter(Boolean).join(" ");
          dados.numero = dados.numero || val("numenderestab", "numero");
          const complemento = val("complenderestab", "complemento");
          dados.complemento = dados.complemento || (complemento && !/^\*+$/.test(complemento) ? complemento : "");
          dados.bairro = dados.bairro || val("bairroenderestab", "bairro");
          dados.cidade = dados.cidade || val("nomemunic", "cidade");
          dados.cep = dados.cep || val("cependerestab", "cep");
          dados.email = dados.email || val("email");
          const telefone = val("telefone") || (val("dddfone") && val("numerofone") ? `${val("dddfone")} ${val("numerofone")}` : "");
          dados.telefone = dados.telefone || telefone;
          return { ...atual, dados };
        });
      }
    } catch {
      // sem detalhe disponível: campos ficam em branco, sem travar o formulário
    } finally {
      setCarregandoEmpresaDetalhe(false);
    }
  }

  // Automação: ao digitar um CNPJ completo (14 dígitos) direto no campo CNPJ
  // (sem passar pela busca "Buscar empresa"), procura a empresa correspondente
  // no cadastro Questor já carregado e preenche o resto sozinho — mesma coisa
  // que selecionarEmpresa faz ao clicar num resultado da busca.
  useEffect(() => {
    if (!modal) return;
    const digitos = somenteDigitos(modal.dados.cnpj);
    if (digitos.length !== 14) return;
    if (cnpjJaBuscadoRef.current === digitos) return;
    cnpjJaBuscadoRef.current = digitos;
    (async () => {
      await garantirEmpresasCarregadas();
      const achada = empresasRef.current.find((e) => somenteDigitos(e.cnpj ?? "") === digitos);
      if (achada) {
        selecionarEmpresa(achada);
      } else {
        setErro(`CNPJ ${formatarCnpj(digitos)} não encontrado no cadastro de empresas ativas do Questor.`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.dados.cnpj]);

  function selecionarIndicacao(ind: Indicacao) {
    setCampo("indicacao", ind.nome);
    setBuscaIndicacao("");
    setIndicacaoAberta(false);
  }

  async function criarNovaIndicacao() {
    const nome = window.prompt("Nome da nova indicação:");
    if (!nome || !nome.trim()) return;
    try {
      const r = await fetch("/api/paralegal/indicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), telefone: "", celular: "", whatsapp: "" }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao criar indicação."); return; }
      setIndicacoes((atual) => [...atual, j.item].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setCampo("indicacao", nome.trim());
      setBuscaIndicacao("");
    } catch {
      setErro("Falha de rede ao criar indicação.");
    }
  }

  async function salvar() {
    if (!modal) return;
    if (!modal.dados.titulo.trim()) { setErro("Título é obrigatório."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const editando = modal.editando;
      // Igual ao formulário original: campos de texto/data vazios não são
      // enviados (só sobrescreve o que realmente foi preenchido). Serviços e
      // valores são a exceção — aqui são sempre enviados como um todo, então
      // remover uma linha de serviço e salvar limpa ela de verdade (no sistema
      // antigo a linha escondida não era enviada e o valor salvo ficava intocado).
      const corpo: Record<string, unknown> = { servicos: modal.dados.servicos, valoresServ: modal.dados.valoresServ, valorTT: modal.dados.valorTT };
      (Object.keys(modal.dados) as (keyof typeof modal.dados)[]).forEach((chave) => {
        if (chave === "servicos" || chave === "valoresServ" || chave === "valorTT") return;
        const valor = modal.dados[chave];
        if (valor === "" || valor === null) return;
        corpo[chave] = valor;
      });
      const r = await fetch(editando ? `/api/paralegal/os/${editando.id}` : "/api/paralegal/os", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
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

  function baixarPdf(o: OS) {
    const doc = gerarDocPdfOS(o);
    doc.save(nomeArquivoPdfOS(o));
  }

  async function enviarPorEmail(o: OS) {
    setEnviando(true);
    setErro(null);
    try {
      const doc = gerarDocPdfOS(o);
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const r = await fetch("/api/paralegal/os/enviar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, destinatario, pdfBase64, nomeArquivo: nomeArquivoPdfOS(o) }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao enviar e-mail."); return; }
      alert(`E-mail enviado para ${j.enviadoPara}.`);
    } catch {
      setErro("Falha de rede ao enviar e-mail.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(o: OS) {
    if (!confirm(`Excluir a OS "${o.titulo}"?`)) return;
    try {
      const r = await fetch(`/api/paralegal/os/${o.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao excluir."); return; }
      await carregar();
    } catch {
      setErro("Falha de rede ao excluir.");
    }
  }

  function setCampo<K extends keyof Omit<OS, "id">>(chave: K, valor: Omit<OS, "id">[K]) {
    setModal((atual) => (atual ? { ...atual, dados: { ...atual.dados, [chave]: valor } } : atual));
  }

  function setServicoOpcao(i: number, valor: string) {
    if (!modal) return;
    if (valor === OUTRO_SERVICO) {
      setServicoManual((atual) => { const n = [...atual] as typeof atual; n[i] = true; return n; });
      const servicos = [...modal.dados.servicos] as OS["servicos"];
      servicos[i] = "";
      setCampo("servicos", servicos);
      return;
    }
    const servicos = [...modal.dados.servicos] as OS["servicos"];
    servicos[i] = valor;
    setCampo("servicos", servicos);
  }

  function setServicoTexto(i: number, valor: string) {
    if (!modal) return;
    const servicos = [...modal.dados.servicos] as OS["servicos"];
    servicos[i] = valor;
    setCampo("servicos", servicos);
  }

  function setValorServico(i: number, valor: string) {
    if (!modal) return;
    const valores = [...modal.dados.valoresServ] as OS["valoresServ"];
    valores[i] = valor === "" ? null : Number(valor);
    setCampo("valoresServ", valores);
  }

  // Valor total é sempre a soma dos 4 serviços — igual ao "somenteLeitura" do formulário original.
  const valorTotalCalculado = useMemo(() => {
    if (!modal) return null;
    const soma = modal.dados.valoresServ.reduce((acc: number, v) => acc + (v ?? 0), 0);
    return soma > 0 ? soma : null;
  }, [modal]);

  useEffect(() => {
    if (modal && modal.dados.valorTT !== valorTotalCalculado) setCampo("valorTT", valorTotalCalculado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTotalCalculado]);

  return (
    <div>
      <div className="pl-toolbar">
        <input type="text" placeholder="Buscar por número da OS, código Questor, razão social, CNPJ ou contato…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="pl-btn" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
        <button className="pl-btn primary" onClick={abrirNovo}>+ Nova OS</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead>
            <tr><th>Nº OS</th><th>Título</th><th>Razão social</th><th>CNPJ</th><th>Data</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {filtrados.map((o) => (
              <tr key={o.id}>
                <td>{o.codigo}</td>
                <td>{o.titulo}</td>
                <td>{o.razao}</td>
                <td>{o.cnpj}</td>
                <td>{o.data ? new Date(o.data).toLocaleDateString("pt-BR") : ""}</td>
                <td>{formatarValor(o.valorTT)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="pl-btn" onClick={() => baixarPdf(o)}>PDF</button>{" "}
                  <button className="pl-btn" onClick={() => abrirEdicao(o)}>Editar</button>{" "}
                  <button className="pl-btn danger" onClick={() => excluir(o)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!carregando && filtrados.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--pl-ink-soft)" }}>Nenhuma OS encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="pl-modal-bg" onClick={() => !salvando && setModal(null)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>{modal.editando ? "Editar OS" : "Nova OS"}</h3>

            <h3 style={{ fontSize: 12 }}>Empresa (Questor)</h3>
            <div ref={empresaBuscaRef} style={{ position: "relative", marginBottom: 16 }}>
              <label style={{ marginBottom: 0 }}>
                <span>Buscar empresa</span>
                <input
                  value={buscaEmpresa}
                  placeholder="Nome, CNPJ ou código Questor..."
                  onChange={(e) => { setBuscaEmpresa(e.target.value); setEmpresaAberta(true); }}
                  onFocus={() => setEmpresaAberta(true)}
                />
              </label>
              {empresaAberta && empresasFiltradas.length > 0 && (
                <div className="pl-dropdown" style={{ position: "absolute", zIndex: 5, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--pl-border)", borderRadius: 8, maxHeight: 220, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.12)" }}>
                  {empresasFiltradas.map((e) => (
                    <div
                      key={e.codigoempresa}
                      onClick={() => selecionarEmpresa(e)}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--pl-border)" }}
                    >
                      <strong>{e.nome ?? "—"}</strong>
                      <div style={{ color: "var(--pl-ink-soft)", fontSize: 12 }}>{formatarCnpj(e.cnpj) || e.cnpj || "—"} · Código {e.codigoempresa}</div>
                    </div>
                  ))}
                </div>
              )}
              {carregandoEmpresaDetalhe && <div className="pl-banner" style={{ marginTop: 8 }}>Preenchendo dados da empresa…</div>}
            </div>

            <h3 style={{ fontSize: 12 }}>Dados da OS</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 4 }}>
              <label style={{ marginBottom: 0 }}>
                <span>Código</span>
                <input value={modal.dados.codigo} onChange={(e) => setCampo("codigo", e.target.value)} />
              </label>
              <label style={{ marginBottom: 0 }}>
                <span>Tipo</span>
                <select value={modal.dados.tipo} onChange={(e) => setCampo("tipo", e.target.value)} style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, width: "100%" }}>
                  <option value="">Selecione...</option>
                  {TIPOS_OS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ marginBottom: 0 }}><span>Cód. Questor</span><input value={modal.dados.questor} onChange={(e) => setCampo("questor", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Data</span><input type="date" value={modal.dados.data ?? ""} onChange={(e) => setCampo("data", e.target.value || null)} /></label>
              <label style={{ marginBottom: 0 }}><span>Data início</span><input type="date" value={modal.dados.dataInicio ?? ""} onChange={(e) => setCampo("dataInicio", e.target.value || null)} /></label>
            </div>

            <h3 style={{ fontSize: 12, marginTop: 16 }}>Empresa</h3>
            <label><span>Razão social</span><input value={modal.dados.razao} onChange={(e) => setCampo("razao", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ marginBottom: 0 }}><span>CNPJ</span><input value={modal.dados.cnpj} onChange={(e) => setCampo("cnpj", mascararCnpjDigitando(e.target.value))} /></label>
              <label style={{ marginBottom: 0 }}><span>Natureza jurídica</span><input value={modal.dados.natJuridica} onChange={(e) => setCampo("natJuridica", e.target.value)} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Outra empresa</span><input value={modal.dados.outraEmpresa} onChange={(e) => setCampo("outraEmpresa", e.target.value)} /></label>
              <div ref={indicacaoBuscaRef} style={{ position: "relative" }}>
                <label style={{ marginBottom: 0 }}>
                  <span>
                    Indicação{" "}
                    <button type="button" onClick={criarNovaIndicacao} style={{ background: "none", border: "none", color: "var(--pl-primary, #12488c)", cursor: "pointer", fontSize: 12, padding: 0 }}>
                      + Nova indicação
                    </button>
                  </span>
                  <input
                    value={modal.dados.indicacao || buscaIndicacao}
                    placeholder="Buscar indicação já cadastrada..."
                    onChange={(e) => { setCampo("indicacao", ""); setBuscaIndicacao(e.target.value); setIndicacaoAberta(true); }}
                    onFocus={() => setIndicacaoAberta(true)}
                  />
                </label>
                {indicacaoAberta && indicacoesFiltradas.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 5, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--pl-border)", borderRadius: 8, maxHeight: 180, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.12)" }}>
                    {indicacoesFiltradas.map((i) => (
                      <div key={i.id} onClick={() => selecionarIndicacao(i)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--pl-border)" }}>
                        {i.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Tratado com</span><input value={modal.dados.tratadoCom} onChange={(e) => setCampo("tratadoCom", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Usuário</span><input value={modal.dados.usuario} onChange={(e) => setCampo("usuario", e.target.value)} /></label>
            </div>

            <h3 style={{ fontSize: 12, marginTop: 16 }}>Endereço</h3>
            <label><span>Logradouro</span><input value={modal.dados.logradouro} onChange={(e) => setCampo("logradouro", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Número</span><input value={modal.dados.numero} onChange={(e) => setCampo("numero", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Complemento</span><input value={modal.dados.complemento} onChange={(e) => setCampo("complemento", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Bairro</span><input value={modal.dados.bairro} onChange={(e) => setCampo("bairro", e.target.value)} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Cidade</span><input value={modal.dados.cidade} onChange={(e) => setCampo("cidade", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>CEP</span><input value={modal.dados.cep} onChange={(e) => setCampo("cep", e.target.value)} /></label>
            </div>

            <h3 style={{ fontSize: 12, marginTop: 16 }}>Contato</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Contato</span><input value={modal.dados.contato} onChange={(e) => setCampo("contato", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>E-mail</span><input type="email" value={modal.dados.email} onChange={(e) => setCampo("email", e.target.value)} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Telefone</span><input value={modal.dados.telefone} onChange={(e) => setCampo("telefone", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Celular</span><input value={modal.dados.celular} onChange={(e) => setCampo("celular", e.target.value)} /></label>
            </div>

            <h3 style={{ marginTop: 18 }}>Serviços</h3>
            {Array.from({ length: qtdServicos }, (_, i) => i).map((i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, marginBottom: 10, alignItems: "end" }}>
                <label style={{ marginBottom: 0 }}>
                  <span>Serviço {i + 1}</span>
                  {servicoManual[i] ? (
                    <input
                      value={modal.dados.servicos[i]}
                      placeholder="Especifique o serviço…"
                      onChange={(e) => setServicoTexto(i, e.target.value)}
                      onBlur={() => { if (!modal.dados.servicos[i]) setServicoManual((a) => { const n = [...a] as typeof a; n[i] = false; return n; }); }}
                    />
                  ) : (
                    <select
                      value={SERVICOS_OPCOES.includes(modal.dados.servicos[i]) ? modal.dados.servicos[i] : ""}
                      onChange={(e) => setServicoOpcao(i, e.target.value)}
                      style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, width: "100%" }}
                    >
                      <option value="">Selecione...</option>
                      {SERVICOS_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
                      <option value={OUTRO_SERVICO}>{OUTRO_SERVICO}</option>
                    </select>
                  )}
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span>Valor</span>
                  <input type="number" step="0.01" value={modal.dados.valoresServ[i] ?? ""} onChange={(e) => setValorServico(i, e.target.value)} />
                </label>
                {qtdServicos > 1 && i === qtdServicos - 1 ? (
                  <button
                    type="button"
                    className="pl-btn danger"
                    title="Remover este serviço"
                    onClick={() => {
                      setServicoTexto(i, "");
                      setValorServico(i, "");
                      setServicoManual((a) => { const n = [...a] as typeof a; n[i] = false; return n; });
                      setQtdServicos((q) => q - 1);
                    }}
                  >
                    ✕
                  </button>
                ) : <span />}
              </div>
            ))}
            {qtdServicos < 4 && (
              <button type="button" className="pl-btn" style={{ marginBottom: 10 }} onClick={() => setQtdServicos((q) => Math.min(4, q + 1))}>
                + Adicionar serviço
              </button>
            )}
            <label><span>Valor total</span><input value={formatarValor(modal.dados.valorTT)} readOnly disabled /></label>
            <label><span>Observações gerais</span><textarea rows={2} value={modal.dados.obsGerais} onChange={(e) => setCampo("obsGerais", e.target.value)} /></label>
            <label><span>Observações</span><textarea rows={2} value={modal.dados.obs} onChange={(e) => setCampo("obs", e.target.value)} /></label>

            {modal.editando && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, marginBottom: 4 }}>
                <select value={destinatario} onChange={(e) => setDestinatario(e.target.value as "geral" | "financeiro")} style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5 }}>
                  <option value="geral">Enviar para Geral</option>
                  <option value="financeiro">Enviar para Financeiro</option>
                </select>
                <button className="pl-btn" onClick={() => enviarPorEmail(modal.editando as OS)} disabled={enviando}>
                  {enviando ? "Enviando…" : "✉ Enviar por e-mail"}
                </button>
              </div>
            )}

            <div className="pl-toolbar" style={{ marginTop: 4 }}>
              <button className="pl-btn" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              {modal.editando && <button className="pl-btn" onClick={() => baixarPdf(modal.editando as OS)}>Baixar PDF</button>}
              <button className="pl-btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
