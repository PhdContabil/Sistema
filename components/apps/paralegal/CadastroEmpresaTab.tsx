"use client";

// Cadastro de Empresa — migrado 100% do index.html + cadastro-empresa.js do
// Paralegal System antigo (tela de criação de empresa nova no Questor).
// Diferente das outras abas do Controle (que só leem SharePoint/Questor),
// esta ESCREVE uma empresa nova no Questor — ver lib/questor.ts
// (criarCadastroEmpresa) para o aviso sobre o endpoint de escrita.

import { useEffect, useMemo, useRef, useState } from "react";

interface LookupItem {
  codigo: string;
  descricao: string;
}

interface Socio {
  id: number;
  nomesocio: string;
  inscrfederal: string; // CPF mascarado
  datanasc: string;
  datainicial: string;
  estadocivil: string;
  numerorg: string;
  siglaestadorg: string;
  datarg: string;
  nomemae: string;
  nomepai: string;
  declarafisicaescrit: string;
  quantcotas: string;
  percentcotas: string;
  dddfone: string;
  numerofone: string;
  email: string;
}

const ESTADO_CIVIL_OPCOES = [
  { valor: "0", texto: "Em branco" },
  { valor: "1", texto: "Solteiro(a)" },
  { valor: "2", texto: "Casado(a)" },
  { valor: "3", texto: "Divorciado(a) / Separado(a) judicialmente" },
  { valor: "4", texto: "Viúvo(a)" },
  { valor: "5", texto: "Concubinado(a)" },
  { valor: "6", texto: "Outros" },
];

const CAMPO_LABEL: Record<string, string> = {
  codigoempresa: "Código da empresa",
  nomeempresa: "Nome (razão social)",
  nomefantasia: "Nome fantasia",
  inscrfederal: "CNPJ",
  codigonaturjurid: "Natureza jurídica",
  tipoenquad: "Enquadramento",
  codigotabferiado: "Tabela de feriado",
  datainicioativ: "Data de início da atividade",
  codigoativfederal: "Atividade (CNAE)",
  codigotipolograd: "Tipo de logradouro",
  enderecoestab: "Endereço",
  numenderestab: "Número",
  bairroenderestab: "Bairro",
  siglaestado: "Estado (UF)",
  codigomunic: "Município",
  cependerestab: "CEP",
  dddfone: "DDD",
  numerofone: "Telefone",
  email: "E-mail",
};

function somenteDigitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function mascararCnpj(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 14);
  let out = digitos;
  if (digitos.length > 2) out = digitos.slice(0, 2) + "." + digitos.slice(2);
  if (digitos.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (digitos.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (digitos.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
}

function mascararCpf(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  let out = digitos;
  if (digitos.length > 3) out = digitos.slice(0, 3) + "." + digitos.slice(3);
  if (digitos.length > 6) out = out.slice(0, 7) + "." + out.slice(7);
  if (digitos.length > 9) out = out.slice(0, 11) + "-" + out.slice(11);
  return out;
}

function mascararRg(valor: string): string {
  let limpo = (valor || "").toUpperCase().replace(/[^0-9X]/g, "").slice(0, 9);
  const semX = limpo.replace(/X/g, "");
  if (semX.length !== limpo.length) limpo = semX.slice(0, 8) + (limpo.includes("X") ? "X" : "");
  let out = limpo;
  if (limpo.length > 2) out = limpo.slice(0, 2) + "." + limpo.slice(2);
  if (limpo.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (limpo.length > 8) out = out.slice(0, 10) + "-" + out.slice(10);
  return out;
}

function novoSocio(id: number, iniciais?: Partial<Socio>): Socio {
  return {
    id,
    nomesocio: iniciais?.nomesocio ?? "",
    inscrfederal: iniciais?.inscrfederal ? mascararCpf(iniciais.inscrfederal) : "",
    datanasc: iniciais?.datanasc ?? "",
    datainicial: iniciais?.datainicial ?? "",
    estadocivil: iniciais?.estadocivil ?? "",
    numerorg: iniciais?.numerorg ?? "",
    siglaestadorg: iniciais?.siglaestadorg ?? "",
    datarg: iniciais?.datarg ?? "",
    nomemae: iniciais?.nomemae ?? "",
    nomepai: iniciais?.nomepai ?? "",
    declarafisicaescrit: iniciais?.declarafisicaescrit ?? "",
    quantcotas: iniciais?.quantcotas ?? "",
    percentcotas: iniciais?.percentcotas ?? "",
    dddfone: iniciais?.dddfone ?? "",
    numerofone: iniciais?.numerofone ?? "",
    email: iniciais?.email ?? "",
  };
}

const DADOS_VAZIO = {
  codigoempresa: "",
  nomeempresa: "",
  nomefantasia: "",
  inscrfederal: "",
  codigonaturjurid: "",
  tipoenquad: "",
  codigotabferiado: "",
  datainicioativ: "",
  codigotipolograd: "",
  enderecoestab: "",
  numenderestab: "",
  complenderestab: "",
  bairroenderestab: "",
  siglaestado: "",
  codigomunic: "",
  cependerestab: "",
  dddfone: "",
  numerofone: "",
  email: "",
};

interface CadastroEmpresaTabProps {
  // Vem do botão "Recadastrar" da aba Empresas.
  prefill?: { nome: string; empresa: string; cnpj: string } | null;
  onPrefillConsumido?: () => void;
}

export default function CadastroEmpresaTab({ prefill, onPrefillConsumido }: CadastroEmpresaTabProps = {}) {
  const [dados, setDados] = useState({ ...DADOS_VAZIO });
  const [socios, setSocios] = useState<Socio[]>(() => [novoSocio(1)]);
  const socioIdRef = useRef(1);

  const [naturezas, setNaturezas] = useState<LookupItem[]>([]);
  const [enquadramentos, setEnquadramentos] = useState<LookupItem[]>([]);
  const [feriados, setFeriados] = useState<LookupItem[]>([]);
  const [logradouros, setLogradouros] = useState<LookupItem[]>([]);
  const [estados, setEstados] = useState<LookupItem[]>([]);
  const [municipios, setMunicipios] = useState<LookupItem[]>([]);
  const [carregandoListas, setCarregandoListas] = useState(true);

  const [cnaeBusca, setCnaeBusca] = useState("");
  const [cnaeResultados, setCnaeResultados] = useState<LookupItem[]>([]);
  const [cnaeMostrarResultados, setCnaeMostrarResultados] = useState(false);
  const [cnaeSelecionado, setCnaeSelecionado] = useState<LookupItem | null>(null);

  const [cnpjStatus, setCnpjStatus] = useState<{ texto: string; tipo: "" | "ok" | "erro" }>({ texto: "", tipo: "" });
  const cnpjBuscadoRef = useRef<string | null>(null);

  const [camposErro, setCamposErro] = useState<Set<string>>(new Set());
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<{ codigoempresa: unknown; codigocliente: unknown; tabelas: string[] } | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "sucesso" | "falha"; titulo: string; linhas: string[] } | null>(null);
  const [enviando, setEnviando] = useState<"preview" | "confirmar" | null>(null);
  const dadosUltimoEnvioRef = useRef<typeof DADOS_VAZIO | null>(null);

  function campo<K extends keyof typeof DADOS_VAZIO>(chave: K, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function buscarLookup(tipo: string, params?: Record<string, string>): Promise<LookupItem[]> {
    const qs = new URLSearchParams({ tipo, ...(params ?? {}) });
    const r = await fetch(`/api/paralegal/cadastro-empresa/lookups?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Erro ao consultar o Questor.");
    return Array.isArray(j.dados) ? j.dados : [];
  }

  async function sugerirProximoCodigo() {
    try {
      const r = await fetch("/api/paralegal/cadastro-empresa/proximo-codigo?inicio=1&fim=1999", { cache: "no-store" });
      const j = await r.json();
      const codigo = j?.dados?.[0]?.codigo;
      if (codigo) setDados((d) => (d.codigoempresa ? d : { ...d, codigoempresa: String(codigo) }));
    } catch {
      /* sugestão é best-effort; o campo continua editável */
    }
  }

  // Carrega as listas fixas uma vez, e sugere o próximo código.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregandoListas(true);
      try {
        const [n, e, f, l, uf] = await Promise.all([
          buscarLookup("naturezas-juridicas"),
          buscarLookup("enquadramentos"),
          buscarLookup("tabelas-feriado"),
          buscarLookup("tipos-logradouro"),
          buscarLookup("estados"),
        ]);
        if (cancelado) return;
        setNaturezas(n);
        setEnquadramentos(e);
        setFeriados(f);
        setLogradouros(l);
        setEstados(uf.filter((x) => x.codigo && x.codigo.length === 2));
      } catch (err) {
        if (!cancelado) setResultado({ tipo: "falha", titulo: "Não foi possível carregar as listas do Questor.", linhas: [err instanceof Error ? err.message : "Erro desconhecido."] });
      } finally {
        if (!cancelado) setCarregandoListas(false);
      }
    })();
    sugerirProximoCodigo();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill vindo do "Recadastrar" da aba Empresas.
  useEffect(() => {
    if (!prefill) return;
    setDados((d) => ({ ...d, nomeempresa: prefill.empresa || d.nomeempresa, nomefantasia: prefill.nome || d.nomefantasia, inscrfederal: mascararCnpj(prefill.cnpj || "") }));
    cnpjBuscadoRef.current = null;
    onPrefillConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Município depende do estado escolhido.
  async function aoTrocarEstado(uf: string) {
    campo("siglaestado", uf);
    campo("codigomunic", "");
    if (!uf) { setMunicipios([]); return; }
    try {
      const lista = await buscarLookup("municipios", { uf });
      setMunicipios(lista);
    } catch {
      setMunicipios([]);
    }
  }

  // Busca de CNAE com debounce (350ms, mínimo 3 caracteres) — igual ao antigo.
  useEffect(() => {
    const termo = cnaeBusca.trim();
    if (termo.length < 3) { setCnaeMostrarResultados(false); return; }
    const t = setTimeout(async () => {
      try {
        const lista = await buscarLookup("cnaes", { q: termo });
        if (!lista.length) { setCnaeMostrarResultados(false); return; }
        setCnaeResultados(lista.slice(0, 15));
        setCnaeMostrarResultados(true);
      } catch {
        setCnaeMostrarResultados(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [cnaeBusca]);

  function selecionarCnae(c: LookupItem) {
    setCnaeSelecionado(c);
    setCnaeBusca(`${c.codigo} - ${c.descricao}`);
    setCnaeMostrarResultados(false);
  }

  // Busca pública de CNPJ (BrasilAPI) — igual ao antigo, direto do navegador
  // (não passa pela nossa API, não usa nenhuma chave).
  async function preencherComDadosCnpjPublico(digitos: string) {
    setCnpjStatus({ texto: "Buscando dados do CNPJ...", tipo: "" });
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
      if (!resp.ok) throw new Error(resp.status === 404 ? "CNPJ não encontrado." : "Erro ao consultar CNPJ.");
      const d = await resp.json();

      setDados((prev) => {
        const novo = { ...prev };
        if (d.razao_social && !prev.nomeempresa.trim()) novo.nomeempresa = d.razao_social;
        if (d.nome_fantasia && !prev.nomefantasia.trim()) novo.nomefantasia = d.nome_fantasia;
        if (d.logradouro) novo.enderecoestab = d.logradouro;
        if (d.numero) novo.numenderestab = String(d.numero);
        if (d.complemento) novo.complenderestab = d.complemento;
        if (d.bairro) novo.bairroenderestab = d.bairro;
        if (d.cep) novo.cependerestab = d.cep;
        if (d.data_inicio_atividade && !prev.datainicioativ) novo.datainicioativ = d.data_inicio_atividade;
        if (d.email && !prev.email.trim()) novo.email = d.email;
        if (d.ddd_telefone_1) {
          const foneDigitos = String(d.ddd_telefone_1).replace(/\D/g, "");
          if (foneDigitos.length >= 10) { novo.dddfone = foneDigitos.slice(0, 2); novo.numerofone = foneDigitos.slice(2); }
        }
        return novo;
      });

      if (d.descricao_tipo_de_logradouro) {
        const alvo = d.descricao_tipo_de_logradouro.trim().toLowerCase();
        const opcao = logradouros.find((o) => o.descricao.trim().toLowerCase() === alvo);
        if (opcao) campo("codigotipolograd", opcao.codigo);
      }

      if (d.uf) {
        campo("siglaestado", d.uf);
        const listaMunicipios = await buscarLookup("municipios", { uf: d.uf });
        setMunicipios(listaMunicipios);
        if (d.municipio) {
          const alvo = String(d.municipio).trim().toLowerCase();
          const opcao = listaMunicipios.find((o) => o.descricao.trim().toLowerCase() === alvo);
          if (opcao) campo("codigomunic", opcao.codigo);
        }
      }

      if (d.cnae_fiscal_descricao && !cnaeSelecionado) {
        try {
          const lista = await buscarLookup("cnaes", { q: d.cnae_fiscal_descricao });
          if (lista.length) selecionarCnae(lista[0]);
        } catch { /* ignora */ }
      }

      setCnpjStatus({ texto: `Dados de "${d.razao_social || ""}" preenchidos automaticamente. Confira tudo antes de continuar.`, tipo: "ok" });
    } catch (e) {
      setCnpjStatus({ texto: e instanceof Error ? e.message : "Não foi possível buscar os dados desse CNPJ automaticamente.", tipo: "erro" });
    }
  }

  // Dispara a busca de CNPJ quando o campo tem 14 dígitos novos.
  useEffect(() => {
    const digitos = somenteDigitos(dados.inscrfederal);
    if (digitos.length !== 14) { if (!digitos) setCnpjStatus({ texto: "", tipo: "" }); return; }
    if (cnpjBuscadoRef.current === digitos) return;
    const t = setTimeout(() => {
      cnpjBuscadoRef.current = digitos;
      preencherComDadosCnpjPublico(digitos);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.inscrfederal]);

  function adicionarSocio() {
    socioIdRef.current += 1;
    setSocios((s) => [...s, novoSocio(socioIdRef.current)]);
  }

  function removerSocio(id: number) {
    setSocios((s) => s.filter((x) => x.id !== id));
  }

  function editarSocio(id: number, patch: Partial<Socio>) {
    setSocios((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function destacar(chaves: string[]) {
    setCamposErro(new Set(chaves));
  }

  function extrairProblemas(corpo: { erro?: unknown; detail?: unknown }): { linhas: string[]; chaves: string[] } {
    const erro = corpo?.erro !== undefined && corpo?.erro !== null ? corpo.erro : corpo?.detail;
    if (!erro) return { linhas: ["Não foi possível concluir. Tente novamente."], chaves: [] };

    if (typeof erro === "string") {
      const prefixo = "Campos obrigatórios faltando:";
      if (erro.startsWith(prefixo)) {
        const chaves = erro.slice(prefixo.length).split(",").map((s) => s.trim()).filter(Boolean);
        return { linhas: chaves.map((c) => "Falta preencher: " + (CAMPO_LABEL[c] || c)), chaves };
      }
      return { linhas: [erro], chaves: [] };
    }

    if (erro && typeof erro === "object" && Array.isArray((erro as { detail?: unknown[] }).detail)) {
      const chaves: string[] = [];
      const linhas = ((erro as { detail: Array<{ loc?: string[]; msg?: string }> }).detail).map((d) => {
        const campo2 = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        if (campo2) chaves.push(campo2);
        return (CAMPO_LABEL[campo2 as string] || campo2 || "Campo") + ": " + (d.msg || "valor inválido");
      });
      return { linhas: linhas.length ? linhas : ["Dados inválidos. Confira o formulário."], chaves };
    }

    if (typeof erro === "object" && erro) {
      const objErro = erro as { message?: unknown; erro?: unknown };
      if (objErro.message) return { linhas: [String(objErro.message)], chaves: [] };
      if (objErro.erro) return { linhas: [String(objErro.erro)], chaves: [] };
    }

    return { linhas: ["A API do Questor recusou o cadastro. Confira os dados e tente novamente."], chaves: [] };
  }

  function montarDados() {
    return {
      ...dados,
      codigoativfederal: cnaeSelecionado?.codigo ?? "",
      socios: socios.map((s) => ({
        nomesocio: s.nomesocio.trim(),
        inscrfederal: s.inscrfederal.trim(),
        datanasc: s.datanasc,
        datainicial: s.datainicial,
        estadocivil: s.estadocivil,
        numerorg: s.numerorg.trim(),
        siglaestadorg: s.siglaestadorg.trim().toUpperCase(),
        datarg: s.datarg,
        nomemae: s.nomemae.trim(),
        nomepai: s.nomepai.trim(),
        declarafisicaescrit: s.declarafisicaescrit,
        quantcotas: s.quantcotas.trim(),
        percentcotas: s.percentcotas.trim(),
        dddfone: s.dddfone.trim(),
        numerofone: s.numerofone.trim(),
        email: s.email.trim(),
      })),
    };
  }

  function validarAntesDeEnviar(): string | null {
    if (!cnaeSelecionado) return "Selecione um CNAE na busca antes de continuar.";
    if (!socios.length) return "Adicione pelo menos um sócio no Quadro Societário.";
    for (const s of socios) {
      const cpfDigitos = somenteDigitos(s.inscrfederal);
      if (!s.nomesocio.trim() || cpfDigitos.length !== 11) return "Confira o Quadro Societário: todo sócio precisa de nome e CPF válido (11 dígitos).";
      if (!s.datainicial) return "Confira o Quadro Societário: informe a data de entrada de cada sócio na sociedade.";
      if (!s.nomemae.trim() || !s.nomepai.trim()) return "Confira o Quadro Societário: informe o nome da mãe e do pai de cada sócio.";
    }
    return null;
  }

  async function enviarCadastro(dryRun: boolean, confirmar: boolean) {
    const dadosMontados = montarDados();
    dadosUltimoEnvioRef.current = dados;
    const r = await fetch("/api/paralegal/cadastro-empresa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dados: dadosMontados, dry_run: dryRun, confirmar }),
    });
    const corpo = await r.json();
    return { ok: r.ok, corpo };
  }

  async function aoPreVisualizar(e: React.FormEvent) {
    e.preventDefault();
    destacar([]);
    const problema = validarAntesDeEnviar();
    if (problema) {
      setResultado({ tipo: "falha", titulo: "Não foi possível continuar.", linhas: [problema] });
      return;
    }

    setAvisos(null);
    setPreview(null);
    setResultado(null);
    setEnviando("preview");
    try {
      const { ok, corpo } = await enviarCadastro(true, false);
      if (!ok) {
        const { linhas, chaves } = extrairProblemas(corpo);
        destacar(chaves);
        setResultado({ tipo: "falha", titulo: "Não foi possível criar a empresa.", linhas });
        return;
      }
      setPreview({ codigoempresa: corpo.codigoempresa, codigocliente: corpo.codigocliente, tabelas: corpo.tabelas ?? [] });
      const avisosFiltrados = (corpo.avisos ?? []).filter((a: string) => !a.toLowerCase().includes("dry_run"));
      setAvisos(avisosFiltrados.length ? avisosFiltrados : null);
    } catch (err) {
      setResultado({ tipo: "falha", titulo: "Não foi possível criar a empresa.", linhas: [err instanceof Error ? err.message : "Erro de rede."] });
    } finally {
      setEnviando(null);
    }
  }

  async function aoConfirmar() {
    if (!preview) return;
    if (!confirm("Confirma a gravação real desta empresa no Questor? Essa ação não pode ser desfeita por aqui.")) return;

    setEnviando("confirmar");
    try {
      const { ok, corpo } = await enviarCadastro(false, true);
      if (ok && corpo.ok) {
        setResultado({
          tipo: "sucesso",
          titulo: `Empresa "${dadosUltimoEnvioRef.current?.nomeempresa ?? ""}" (código ${corpo.codigoempresa}) criada com sucesso.`,
          linhas: corpo.codigocliente ? [`Código do cliente (financeiro): ${corpo.codigocliente}`] : [],
        });
        setPreview(null);
        setAvisos(null);
        setDados({ ...DADOS_VAZIO });
        setSocios([novoSocio(++socioIdRef.current)]);
        setCnaeSelecionado(null);
        setCnaeBusca("");
        cnpjBuscadoRef.current = null;
        setCnpjStatus({ texto: "", tipo: "" });
        sugerirProximoCodigo();
      } else {
        const { linhas, chaves } = extrairProblemas(corpo);
        destacar(chaves);
        setResultado({ tipo: "falha", titulo: "Não foi possível criar a empresa.", linhas });
      }
    } catch (err) {
      setResultado({ tipo: "falha", titulo: "Não foi possível criar a empresa.", linhas: [err instanceof Error ? err.message : "Erro de rede."] });
    } finally {
      setEnviando(null);
    }
  }

  const erro = (chave: string) => (camposErro.has(chave) ? " pl-campo-erro" : "");

  const opcoesEstadoCivil = useMemo(
    () => ESTADO_CIVIL_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>),
    []
  );

  return (
    <div className="pl-cadastro-empresa">
      <form onSubmit={aoPreVisualizar}>
        <div className="pl-card">
          <h2>Dados da Empresa</h2>
          <div className="pl-form-grid">
            <label>Código da empresa
              <input type="number" min={1} max={1999} required value={dados.codigoempresa} onChange={(e) => campo("codigoempresa", e.target.value)} className={erro("codigoempresa")} />
            </label>
            <label className="full">Nome (razão social)
              <input type="text" required value={dados.nomeempresa} onChange={(e) => campo("nomeempresa", e.target.value)} className={erro("nomeempresa")} />
            </label>
            <label>Nome fantasia
              <input type="text" value={dados.nomefantasia} onChange={(e) => campo("nomefantasia", e.target.value)} />
            </label>
            <label className="full">CNPJ
              <input type="text" placeholder="00.000.000/0000-00" maxLength={18} required value={dados.inscrfederal} onChange={(e) => campo("inscrfederal", mascararCnpj(e.target.value))} className={erro("inscrfederal")} />
              {cnpjStatus.texto && <span className={`pl-cnpj-status${cnpjStatus.tipo ? " " + cnpjStatus.tipo : ""}`}>{cnpjStatus.texto}</span>}
            </label>
            <label>Natureza jurídica
              <select required value={dados.codigonaturjurid} onChange={(e) => campo("codigonaturjurid", e.target.value)} className={erro("codigonaturjurid")}>
                <option value="">{carregandoListas ? "carregando..." : "selecione"}</option>
                {naturezas.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </select>
            </label>
            <label>Enquadramento
              <select required value={dados.tipoenquad} onChange={(e) => campo("tipoenquad", e.target.value)} className={erro("tipoenquad")}>
                <option value="">{carregandoListas ? "carregando..." : "selecione"}</option>
                {enquadramentos.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </select>
            </label>
            <label>Tabela de feriado
              <select required value={dados.codigotabferiado} onChange={(e) => campo("codigotabferiado", e.target.value)} className={erro("codigotabferiado")}>
                <option value="">{carregandoListas ? "carregando..." : "selecione"}</option>
                {feriados.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </select>
            </label>
            <label>Data de início da atividade
              <input type="date" required value={dados.datainicioativ} onChange={(e) => campo("datainicioativ", e.target.value)} className={erro("datainicioativ")} />
            </label>
          </div>
        </div>

        <div className="pl-card" style={{ marginTop: 16 }}>
          <h2>Atividade (CNAE)</h2>
          <div className="pl-form-grid">
            <label className="full">Buscar CNAE (por texto ou código)
              <input type="text" placeholder="ex.: cabeleireiro, ou 4781-4/00" value={cnaeBusca} onChange={(e) => { setCnaeBusca(e.target.value); setCnaeSelecionado(null); }} className={erro("codigoativfederal")} />
            </label>
          </div>
          {cnaeMostrarResultados && (
            <div className="pl-cnae-resultados">
              {cnaeResultados.map((c) => (
                <div key={c.codigo} onClick={() => selecionarCnae(c)}>{c.codigo} - {c.descricao}</div>
              ))}
            </div>
          )}
          <p className="pl-cnae-selecionado">{cnaeSelecionado ? `Selecionado: ${cnaeSelecionado.codigo} - ${cnaeSelecionado.descricao}` : "Nenhum CNAE selecionado."}</p>
        </div>

        <div className="pl-card" style={{ marginTop: 16 }}>
          <h2>Endereço</h2>
          <div className="pl-form-grid">
            <label>Tipo de logradouro
              <select required value={dados.codigotipolograd} onChange={(e) => campo("codigotipolograd", e.target.value)} className={erro("codigotipolograd")}>
                <option value="">{carregandoListas ? "carregando..." : "selecione"}</option>
                {logradouros.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </select>
            </label>
            <label className="full">Endereço
              <input type="text" required value={dados.enderecoestab} onChange={(e) => campo("enderecoestab", e.target.value)} className={erro("enderecoestab")} />
            </label>
            <label>Número
              <input type="text" required value={dados.numenderestab} onChange={(e) => campo("numenderestab", e.target.value)} className={erro("numenderestab")} />
            </label>
            <label>Complemento
              <input type="text" value={dados.complenderestab} onChange={(e) => campo("complenderestab", e.target.value)} />
            </label>
            <label>Bairro
              <input type="text" value={dados.bairroenderestab} onChange={(e) => campo("bairroenderestab", e.target.value)} />
            </label>
            <label>Estado (UF)
              <select required value={dados.siglaestado} onChange={(e) => aoTrocarEstado(e.target.value)} className={erro("siglaestado")}>
                <option value="">selecione</option>
                {estados.map((n) => <option key={n.codigo} value={n.codigo}>{n.codigo}</option>)}
              </select>
            </label>
            <label>Município
              <select required value={dados.codigomunic} onChange={(e) => campo("codigomunic", e.target.value)} className={erro("codigomunic")} disabled={!dados.siglaestado}>
                <option value="">{dados.siglaestado ? "selecione" : "selecione a UF primeiro"}</option>
                {municipios.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </select>
            </label>
            <label>CEP
              <input type="text" value={dados.cependerestab} onChange={(e) => campo("cependerestab", e.target.value)} className={erro("cependerestab")} />
            </label>
          </div>
        </div>

        <div className="pl-card" style={{ marginTop: 16 }}>
          <h2>Contato</h2>
          <div className="pl-form-grid">
            <label>DDD
              <input type="text" maxLength={2} inputMode="numeric" value={dados.dddfone} onChange={(e) => campo("dddfone", somenteDigitos(e.target.value).slice(0, 2))} />
            </label>
            <label>Telefone
              <input type="text" maxLength={9} inputMode="numeric" placeholder="00000000" value={dados.numerofone} onChange={(e) => campo("numerofone", somenteDigitos(e.target.value).slice(0, 9))} />
            </label>
            <label className="full">E-mail
              <input type="email" value={dados.email} onChange={(e) => campo("email", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="pl-card" style={{ marginTop: 16 }}>
          <h2>Quadro Societário</h2>
          <p className="pl-cnae-selecionado" style={{ marginTop: 0 }}>
            Adicione pelo menos um sócio. Dados essenciais: nome, CPF, nascimento, entrada na sociedade e contato. O endereço do sócio usa por padrão o endereço da empresa.
          </p>
          {socios.map((s, i) => (
            <div key={s.id} className="pl-socio-card">
              {socios.length > 1 && (
                <button type="button" className="pl-btn-remover-socio" onClick={() => removerSocio(s.id)}>remover</button>
              )}
              <div className="pl-socio-titulo">Sócio {i + 1}</div>
              <div className="pl-form-grid">
                <label className="full">Nome completo
                  <input type="text" required value={s.nomesocio} onChange={(e) => editarSocio(s.id, { nomesocio: e.target.value })} />
                </label>
                <label>CPF
                  <input type="text" placeholder="000.000.000-00" maxLength={14} required value={s.inscrfederal} onChange={(e) => editarSocio(s.id, { inscrfederal: mascararCpf(e.target.value) })} />
                </label>
                <label>Data de nascimento
                  <input type="date" value={s.datanasc} onChange={(e) => editarSocio(s.id, { datanasc: e.target.value })} />
                </label>
                <label>Data de entrada na sociedade
                  <input type="date" required value={s.datainicial} onChange={(e) => editarSocio(s.id, { datainicial: e.target.value })} />
                </label>
                <label>Estado civil
                  <select value={s.estadocivil} onChange={(e) => editarSocio(s.id, { estadocivil: e.target.value })}>
                    <option value="">selecione</option>
                    {opcoesEstadoCivil}
                  </select>
                </label>
                <label>RG
                  <input type="text" placeholder="00.000.000-0" maxLength={12} value={s.numerorg} onChange={(e) => editarSocio(s.id, { numerorg: mascararRg(e.target.value) })} />
                </label>
                <label>UF emissora do RG
                  <input type="text" placeholder="ex: SP" maxLength={2} style={{ textTransform: "uppercase" }} value={s.siglaestadorg} onChange={(e) => editarSocio(s.id, { siglaestadorg: e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() })} />
                </label>
                <label>Data de emissão do RG
                  <input type="date" value={s.datarg} onChange={(e) => editarSocio(s.id, { datarg: e.target.value })} />
                </label>
                <label className="full">Nome da mãe
                  <input type="text" required value={s.nomemae} onChange={(e) => editarSocio(s.id, { nomemae: e.target.value })} />
                </label>
                <label className="full">Nome do pai
                  <input type="text" required value={s.nomepai} onChange={(e) => editarSocio(s.id, { nomepai: e.target.value })} />
                </label>
                <label>Faz declaração de pessoa física com a PHD?
                  <select value={s.declarafisicaescrit} onChange={(e) => editarSocio(s.id, { declarafisicaescrit: e.target.value })}>
                    <option value="">selecione</option>
                    <option value="1">Sim</option>
                    <option value="0">Não</option>
                  </select>
                </label>
                <label>Quantidade de cotas
                  <input type="number" min={0} step={1} value={s.quantcotas} onChange={(e) => editarSocio(s.id, { quantcotas: e.target.value })} />
                </label>
                <label>Percentual de cotas (%)
                  <input type="number" min={0} max={100} step={0.01} value={s.percentcotas} onChange={(e) => editarSocio(s.id, { percentcotas: e.target.value })} />
                </label>
                <label>DDD
                  <input type="text" maxLength={2} inputMode="numeric" value={s.dddfone} onChange={(e) => editarSocio(s.id, { dddfone: somenteDigitos(e.target.value).slice(0, 2) })} />
                </label>
                <label>Telefone
                  <input type="text" maxLength={9} inputMode="numeric" placeholder="00000000" value={s.numerofone} onChange={(e) => editarSocio(s.id, { numerofone: somenteDigitos(e.target.value).slice(0, 9) })} />
                </label>
                <label className="full">E-mail
                  <input type="email" value={s.email} onChange={(e) => editarSocio(s.id, { email: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="pl-btn" style={{ width: "100%", marginTop: 4 }} onClick={adicionarSocio}>+ Adicionar sócio</button>
        </div>

        <button type="submit" className="pl-btn primary" style={{ width: "100%", marginTop: 16, padding: "12px 16px" }} disabled={enviando !== null}>
          {enviando === "preview" ? "Pré-visualizando..." : "Pré-visualizar"}
        </button>
        {preview && (
          <button type="button" className="pl-btn" style={{ width: "100%", marginTop: 10 }} onClick={aoConfirmar} disabled={enviando !== null}>
            {enviando === "confirmar" ? "Gravando..." : "Confirmar"}
          </button>
        )}
      </form>

      {avisos && avisos.length > 0 && (
        <div className="pl-avisos-box">
          <strong>Avisos (não impedem o cadastro, mas confira):</strong>
          <ul>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {preview && (
        <div className="pl-preview-box">
          <strong>Pré-visualização (nada foi gravado ainda)</strong><br />
          Código da empresa: {String(preview.codigoempresa ?? "-")}<br />
          Código do cliente (financeiro): {String(preview.codigocliente ?? "-")}<br />
          Tabelas que serão afetadas: {preview.tabelas.join(", ") || "-"}
        </div>
      )}

      {resultado && (
        <div className={`pl-resultado-box ${resultado.tipo}`}>
          <strong>{resultado.titulo}</strong>
          {resultado.linhas.length > 0 && <ul>{resultado.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
