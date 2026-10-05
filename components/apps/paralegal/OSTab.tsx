"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gerarDocPdfOS, nomeArquivoPdfOS, pdfParaBase64 } from "./os-pdf";
import { formatarCnpj, formatarDoc } from "./merge-format";

// Nomes do sistema antigo (AxRegime) pro "regime" que o Questor devolve.
const REGIME_NOME: Record<string, string> = {
  "NORMAL": "Regime Normal",
  "EMPRESA DE PEQUENO PORTE": "Simples Nacional - EPP",
  "MICROEMPRESA": "Simples Nacional - ME",
  "MICRO EMPREENDEDOR INDIVIDUAL": "MEI",
};

type DadosCadastrais = { ativPrincipal: string; inscrEstadual: string; inscrMunicipal: string; regimeTributario: string; cnpj: string; dataInicio: string };

// Busca no cadastro da empresa (Questor) atividade principal, I.E., I.M. e
// regime tributário. Esses campos não ficam salvos na lista da OS, então são
// sempre puxados do cadastro na hora (ao abrir/editar a OS e ao gerar o PDF).
async function buscarDadosCadastrais(codigo: string | number): Promise<DadosCadastrais | null> {
  const cod = String(codigo ?? "").replace(/\D/g, "");
  if (!cod || Number(cod) <= 0) return null;
  try {
    const r = await fetch(`/api/paralegal/empresas/${cod}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.empresa) return null;
    const d = j.empresa as Record<string, unknown>;
    const s = (k: string) => (d[k] === undefined || d[k] === null ? "" : String(d[k]).trim());
    const regime = s("regime");
    return {
      ativPrincipal: [s("codigoativfederal"), s("ativfederal")].filter(Boolean).join(" - "),
      inscrEstadual: s("inscrestad"),
      inscrMunicipal: s("inscrmunic"),
      regimeTributario: REGIME_NOME[regime.toUpperCase()] ?? regime,
      cnpj: formatarDoc(s("inscrfederal")) || s("inscrfederal"),
      // Início das atividades = constituição da empresa/CNPJ (Questor).
      dataInicio: s("datainicioativ").slice(0, 10),
    };
  } catch {
    return null;
  }
}

function preencherVazios<T extends Record<keyof DadosCadastrais, unknown>>(alvo: T, cad: DadosCadastrais): T {
  const novo = { ...alvo };
  (Object.keys(cad) as (keyof DadosCadastrais)[]).forEach((k) => { if (!novo[k] && cad[k]) novo[k] = cad[k] as T[typeof k]; });
  return novo;
}

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
  // Usados só na versão "Geral" do PDF (sem valores) -- ver os-pdf.ts.
  ativPrincipal: string;
  inscrEstadual: string;
  inscrMunicipal: string;
  regimeTributario: string;
  outraEmpresa: string;
  obs: string;
  usuario: string;
  dataInicio: string | null;
  servicos: [string, string, string, string];
  valoresServ: [number | null, number | null, number | null, number | null];
  valorTT: number | null;
  obsGerais: string;
}

// Cliente que existe só no financeiro (cadastro avulso) — GET /financeiro/clientes.
interface ClienteAvulso {
  codigocliente: number; tipo: string; nome: string; tipoinscr: number; inscrfederal: string;
  tipologradouro?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; nomemunic?: string | null; cep?: string | null; telefone?: string | null; email?: string | null;
}

interface EmpresaResumo { codigoempresa: number; nome: string | null; cnpj: string | null; ativa: boolean }
interface Indicacao { id: string; nome: string; telefone: string; celular: string; whatsapp: string }

const VAZIO: Omit<OS, "id"> = {
  titulo: "", data: null, codigo: "", tipo: "", questor: "", razao: "", cnpj: "",
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "",
  contato: "", email: "", telefone: "", celular: "", indicacao: "", tratadoCom: "",
  natJuridica: "", ativPrincipal: "", inscrEstadual: "", inscrMunicipal: "", regimeTributario: "",
  outraEmpresa: "", obs: "", usuario: "", dataInicio: null,
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
function mascararCpfDigitando(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  let out = digitos;
  if (digitos.length > 3) out = digitos.slice(0, 3) + "." + digitos.slice(3);
  if (digitos.length > 6) out = out.slice(0, 7) + "." + out.slice(7);
  if (digitos.length > 9) out = out.slice(0, 11) + "-" + out.slice(11);
  return out;
}

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

// Início dos trabalhos é sempre o 1º dia da competência (mês).
function primeiroDiaDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// SharePoint devolve datas como "2026-09-01T03:00:00Z"; <input type=date> só aceita "2026-09-01".
function paraInputData(v: string | null | undefined): string | null {
  return v ? String(v).slice(0, 10) : null;
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
  // Mostra o convite "Enviar por e-mail agora?" logo depois de criar uma OS nova.
  const [sugerirEnvio, setSugerirEnvio] = useState(false);

  // Busca de empresa (Questor) dentro do modal — mesmo padrão do "_buscaEmpresa"
  // do formulário original: digita, aparece uma lista, clica e autopreenche.
  const [empresas, setEmpresas] = useState<EmpresaResumo[]>([]);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [empresaAberta, setEmpresaAberta] = useState(false);
  const [avulsos, setAvulsos] = useState<ClienteAvulso[]>([]);
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
  // Documento da OS: CNPJ (empresa) ou CPF (pessoa física). Na lista do
  // SharePoint os dois ficam na mesma coluna "cnpj"; o tipo é deduzido pelo
  // número de dígitos ao abrir uma OS existente.
  const [tipoDocOS, setTipoDocOS] = useState<"cnpj" | "cpf">("cnpj");
  // Espelha `empresas` pra ler o valor mais atual dentro do efeito de CNPJ sem
  // precisar depender de `empresas` no array de dependências (evitaria reexecutar
  // a busca toda vez que a lista de empresas mudasse).
  const empresasRef = useRef<EmpresaResumo[]>([]);
  useEffect(() => { empresasRef.current = empresas; }, [empresas]);

  // Devolve a lista recém-carregada (não só atualiza o estado) -- o botão
  // "+ Nova OS" depende disso pra calcular o próximo número sempre em cima do
  // dado mais atual, nunca de um `itens` que ainda possa estar vazio (ver
  // abrirNovo).
  const carregar = useCallback(async (): Promise<OS[]> => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/os", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao carregar."); return []; }
      const lista: OS[] = j.itens ?? [];
      setItens(lista);
      return lista;
    } catch {
      setErro("Falha de rede ao carregar.");
      return [];
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
      if (String(o.id) === qDigitos || somenteDigitos(o.codigo) === qDigitos || somenteDigitos(o.questor) === qDigitos) return true;
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

  // Avulsos (só no financeiro) não estão na lista de empresas: busca na API
  // do financeiro conforme a pessoa digita (nome com 3+ letras ou CPF/CNPJ).
  useEffect(() => {
    const q = buscaEmpresa.trim();
    if (q.length < 3) { setAvulsos([]); return; }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/paralegal/financeiro-clientes?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        if (!cancelado) setAvulsos(r.ok ? ((j.dados ?? []) as ClienteAvulso[]).filter((c) => c.tipo === "avulso").slice(0, 10) : []);
      } catch { if (!cancelado) setAvulsos([]); }
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [buscaEmpresa]);

  function selecionarAvulso(c: ClienteAvulso) {
    setEmpresaAberta(false);
    setBuscaEmpresa("");
    setAvulsos([]);
    const doc = somenteDigitos(c.inscrfederal);
    cnpjJaBuscadoRef.current = doc;
    setTipoDocOS(doc.length === 11 ? "cpf" : "cnpj");
    setModal((atual) => {
      if (!atual) return atual;
      const d = { ...atual.dados };
      d.questor = "";
      d.codigo = String(c.codigocliente);
      d.razao = c.nome ?? "";
      d.cnpj = formatarDoc(doc);
      d.logradouro = [c.tipologradouro, c.logradouro].filter(Boolean).join(" ");
      d.numero = c.numero ?? "";
      d.complemento = c.complemento ?? "";
      d.bairro = c.bairro ?? "";
      d.cidade = c.nomemunic ?? "";
      d.cep = c.cep ?? "";
      d.email = c.email ?? d.email;
      d.telefone = c.telefone ?? d.telefone;
      return { ...atual, dados: d };
    });
  }

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
  function proximoCodigo(lista: OS[]): string {
    let maior = 0;
    for (const o of lista) {
      const nCodigo = parseInt(somenteDigitos(o.codigo), 10);
      if (!isNaN(nCodigo) && nCodigo > maior && nCodigo <= LIMITE_RAZOAVEL) maior = nCodigo;

    }
    return String(maior + 1);
  }

  // Sempre busca a lista mais atual antes de sugerir o número -- nunca confia
  // no `itens` do estado, que pode ainda estar vazio (ex: clique logo na
  // abertura da tela, antes do useEffect inicial terminar). É por isso que
  // `carregar()` devolve a lista em vez de só atualizar o estado.
  async function abrirNovo() {
    const lista = await carregar();
    setModal({ editando: null, dados: { ...VAZIO, data: primeiroDiaDoMes(), codigo: proximoCodigo(lista) } });
    setTipoDocOS("cnpj");
    setSugerirEnvio(false);
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
    const { id: _id, ...dadosOrig } = o;
    const dados = { ...dadosOrig, data: paraInputData(dadosOrig.data), dataInicio: paraInputData(dadosOrig.dataInicio) };
    setModal({ editando: o, dados });
    setSugerirEnvio(false);
    setBuscaEmpresa(""); setBuscaIndicacao("");
    // Já tem CNPJ salvo — não precisa (nem deve) disparar a busca automática de novo.
    cnpjJaBuscadoRef.current = somenteDigitos(dados.cnpj) || null;
    setTipoDocOS(somenteDigitos(dados.cnpj).length === 11 ? "cpf" : "cnpj");
    setServicoManual(dados.servicos.map((s) => !!s && !SERVICOS_OPCOES.includes(s)) as [boolean, boolean, boolean, boolean]);
    const ultimoPreenchido = dados.servicos.reduce((max, s, i) => (s ? i : max), 0);
    setQtdServicos(Math.min(4, Math.max(1, ultimoPreenchido + 1)));
    garantirEmpresasCarregadas(); garantirIndicacoesCarregadas();
    // Atividade / I.E. / I.M. / Regime não ficam salvos na OS: puxa do cadastro.
    if (o.questor) {
      buscarDadosCadastrais(o.questor).then((cad) => {
        if (!cad) return;
        setModal((atual) => (atual && atual.editando?.id === o.id ? { ...atual, dados: preencherVazios(atual.dados, cad) } : atual));
      });
    }
  }

  async function selecionarEmpresa(emp: EmpresaResumo) {
    setEmpresaAberta(false);
    setBuscaEmpresa("");
    setCampo("questor", String(emp.codigoempresa));
    setCampo("razao", emp.nome ?? "");
    setCampo("cnpj", formatarDoc(emp.cnpj) || emp.cnpj || "");
    setTipoDocOS(somenteDigitos(emp.cnpj ?? "").length === 11 ? "cpf" : "cnpj");

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
          dados.ativPrincipal = dados.ativPrincipal || [val("codigoativfederal"), val("ativfederal", "atividadefederal", "descatividade")].filter(Boolean).join(" - ");
          dados.inscrEstadual = dados.inscrEstadual || val("inscrestad");
          dados.inscrMunicipal = dados.inscrMunicipal || val("inscrmunic");
          dados.regimeTributario = dados.regimeTributario || (REGIME_NOME[val("regime").toUpperCase()] ?? val("regime"));
          // Cód. financeiro da OS = código do cliente da empresa no financeiro.
          if (val("codigocliente")) dados.codigo = val("codigocliente");
          dados.dataInicio = dados.dataInicio || (val("datainicioativ").slice(0, 10) || null);
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
    if (digitos.length !== (tipoDocOS === "cpf" ? 11 : 14)) return;
    if (cnpjJaBuscadoRef.current === digitos) return;
    cnpjJaBuscadoRef.current = digitos;
    (async () => {
      await garantirEmpresasCarregadas();
      const achada = empresasRef.current.find((e) => somenteDigitos(e.cnpj ?? "") === digitos);
      if (achada) {
        selecionarEmpresa(achada);
        return;
      }
      // Não é empresa: tenta os avulsos do financeiro.
      try {
        const r = await fetch(`/api/paralegal/financeiro-clientes?q=${digitos}`, { cache: "no-store" });
        const j = await r.json();
        const av = r.ok ? ((j.dados ?? []) as ClienteAvulso[]).find((c) => c.tipo === "avulso") : undefined;
        if (av) { selecionarAvulso(av); return; }
      } catch { /* segue pro aviso */ }
      {
        setErro(`${tipoDocOS === "cpf" ? "CPF" : "CNPJ"} ${formatarDoc(digitos)} não encontrado nas empresas ativas do Questor nem nos clientes avulsos do financeiro.`);
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
      // CPF: cód. Questor não se aplica -- não grava.
      if (tipoDocOS === "cpf") delete corpo.questor;
      const r = await fetch(editando ? `/api/paralegal/os/${editando.id}` : "/api/paralegal/os", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao salvar."); return; }
      if (!editando && j.item) {
        // Acabou de criar: mantém o modal aberto, já em modo de edição da OS
        // recém criada, com o convite pra enviar por e-mail na hora.
        setModal((m) => (m ? { ...m, editando: j.item } : m));
        setSugerirEnvio(true);
        await carregar();
        return;
      }
      setModal(null);
      setSugerirEnvio(false);
      await carregar();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf(o: OS, publico: "geral" | "financeiro" = "financeiro") {
    if (publico === "geral" && o.questor) {
      const cad = await buscarDadosCadastrais(o.questor);
      if (cad) o = preencherVazios(o, cad);
    }
    const doc = await gerarDocPdfOS(o, publico);
    doc.save(nomeArquivoPdfOS(o, publico));
  }

  function baixarArquivoBase64(base64: string, nomeArquivo: string, tipoMime: string) {
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    const blob = new Blob([buffer], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function enviarPorEmail(o: OS, rascunho = false) {
    setEnviando(true);
    setErro(null);
    try {
      if (destinatario === "geral" && o.questor) {
        const cad = await buscarDadosCadastrais(o.questor);
        if (cad) o = preencherVazios(o, cad);
      }
      const doc = await gerarDocPdfOS(o, destinatario);
      const pdfBase64 = pdfParaBase64(doc);
      const r = await fetch("/api/paralegal/os/enviar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, destinatario, pdfBase64, nomeArquivo: nomeArquivoPdfOS(o, destinatario), rascunho }),
      });
      // Lê como texto primeiro: se o servidor devolver uma página de erro (timeout,
      // corpo grande demais etc.) em vez de JSON, mostra o motivo real em vez de
      // cair no genérico "falha de rede".
      const texto = await r.text();
      let j: Record<string, string>;
      try { j = JSON.parse(texto); } catch { setErro(`Erro ${r.status} ao preparar o e-mail: ${texto.slice(0, 200)}`); return; }
      if (!r.ok) { setErro(j.error ?? `Falha ao preparar o e-mail (erro ${r.status}).`); return; }
      setSugerirEnvio(false);
      setErro(null);
      if (rascunho && j.modo === "mailto") {
        baixarArquivoBase64(pdfBase64, nomeArquivoPdfOS(o, destinatario), "application/pdf");
        const mailtoUrl =
          `mailto:${j.destino}` +
          `?subject=${encodeURIComponent(j.assunto)}` +
          `&body=${encodeURIComponent(j.corpoTexto)}`;
        const a = document.createElement("a");
        a.href = mailtoUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
        alert(`Abri o Outlook com a mensagem pronta pra ${j.destino}. Baixei o PDF (${j.nomeArquivo}) -- anexe ele antes de enviar.`);
        return;
      }
      if (j.modo === "graph") {
        // Enviado de verdade pelo Microsoft Graph (Mail.Send), igual ao Paralegal System antigo --
        // não precisa abrir nada no cliente.
        alert(`E-mail enviado para ${j.enviadoPara}.`);
        return;
      }
      // Plano B: o envio pelo Graph falhou, então baixa um .eml com destinatário, assunto, corpo e o
      // PDF já anexados -- ao abrir esse arquivo o Outlook do próprio usuário assume como remetente,
      // e ele só revisa e clica em Enviar.
      baixarArquivoBase64(j.emlBase64, j.nomeArquivoEml || `OS ${destinatario === "geral" ? "Geral" : "Financeiro"} - ${o.id}.eml`, "message/rfc822");
      alert(`Não consegui enviar automaticamente (${j.avisoGraph || "erro no envio"}). Abri um rascunho pra ${j.destino} -- confira no Outlook e clique em Enviar.`);
    } catch (e) {
      console.error("[OS] enviarPorEmail", e);
      setErro("Falha ao preparar o e-mail: " + (e instanceof Error ? e.message : String(e)));
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
        <button className="pl-btn primary" onClick={abrirNovo} disabled={carregando}>{carregando ? "Carregando…" : "+ Nova OS"}</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead>
            <tr><th style={{ whiteSpace: "nowrap" }}>Nº OS</th><th>Título</th><th>Razão social</th><th>CNPJ/CPF</th><th>Data</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {filtrados.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.titulo}</td>
                <td>{o.razao}</td>
                <td style={{ whiteSpace: "nowrap" }}>{o.cnpj}</td>
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
              {empresaAberta && (empresasFiltradas.length > 0 || avulsos.length > 0) && (
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
                  {avulsos.map((c) => (
                    <div
                      key={"av" + c.codigocliente}
                      onClick={() => selecionarAvulso(c)}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--pl-border)" }}
                    >
                      <strong>{c.nome}</strong>
                      <div style={{ color: "var(--pl-ink-soft)", fontSize: 12 }}>{formatarDoc(c.inscrfederal)} · Avulso (só financeiro) · Cód. financeiro {c.codigocliente}</div>
                    </div>
                  ))}
                </div>
              )}
              {carregandoEmpresaDetalhe && <div className="pl-banner" style={{ marginTop: 8 }}>Preenchendo dados da empresa…</div>}
            </div>

            <h3 style={{ fontSize: 12 }}>Dados da OS — Nº {modal.editando ? modal.editando.id : "(gerado ao salvar)"}</h3>
            <label><span>Título</span><input value={modal.dados.titulo} onChange={(e) => setCampo("titulo", e.target.value)} placeholder="Descrição curta da OS" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 4 }}>
              <label style={{ marginBottom: 0 }}>
                <span>Cód. financeiro</span>
                <input value={modal.dados.codigo} onChange={(e) => setCampo("codigo", e.target.value)} />
              </label>
              <label style={{ marginBottom: 0 }}>
                <span>Tipo</span>
                <select value={modal.dados.tipo} onChange={(e) => setCampo("tipo", e.target.value)} style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, width: "100%" }}>
                  <option value="">Selecione...</option>
                  {TIPOS_OS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ marginBottom: 0 }}><span>Cód. empresa (Questor)</span>{tipoDocOS === "cpf"
                ? <input value="" disabled placeholder="não se aplica (CPF)" />
                : <input value={modal.dados.questor} onChange={(e) => setCampo("questor", e.target.value)} />}</label>
              <label style={{ marginBottom: 0 }}><span>Início dos trabalhos</span><input type="date" value={modal.dados.data ?? ""} onChange={(e) => setCampo("data", e.target.value || null)} /></label>
              <label style={{ marginBottom: 0 }}><span>Início das atividades</span><input type="date" value={modal.dados.dataInicio ?? ""} onChange={(e) => setCampo("dataInicio", e.target.value || null)} /></label>
            </div>

            <h3 style={{ fontSize: 12, marginTop: 16 }}>Empresa</h3>
            <label><span>Razão social</span><input value={modal.dados.razao} onChange={(e) => setCampo("razao", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ marginBottom: 0 }}>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name="tipoDocOS" checked={tipoDocOS === "cnpj"} onChange={() => { setTipoDocOS("cnpj"); setCampo("cnpj", ""); }} style={{ width: "auto" }} /> CNPJ</span>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name="tipoDocOS" checked={tipoDocOS === "cpf"} onChange={() => { setTipoDocOS("cpf"); setCampo("cnpj", ""); }} style={{ width: "auto" }} /> CPF</span>
                </span>
                <input placeholder={tipoDocOS === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} value={modal.dados.cnpj} onChange={(e) => setCampo("cnpj", tipoDocOS === "cpf" ? mascararCpfDigitando(e.target.value) : mascararCnpjDigitando(e.target.value))} />
              </label>
              <label style={{ marginBottom: 0 }}><span>Natureza jurídica</span><input value={modal.dados.natJuridica} onChange={(e) => setCampo("natJuridica", e.target.value)} /></label>
            </div>
            <label style={{ marginTop: 10 }}><span>Atividade principal (CNAE)</span><input value={modal.dados.ativPrincipal} onChange={(e) => setCampo("ativPrincipal", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label style={{ marginBottom: 0 }}><span>Inscrição estadual</span><input value={modal.dados.inscrEstadual} onChange={(e) => setCampo("inscrEstadual", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Inscrição municipal</span><input value={modal.dados.inscrMunicipal} onChange={(e) => setCampo("inscrMunicipal", e.target.value)} /></label>
              <label style={{ marginBottom: 0 }}><span>Regime tributário</span><input value={modal.dados.regimeTributario} onChange={(e) => setCampo("regimeTributario", e.target.value)} /></label>
            </div>
            <p className="pl-cnae-selecionado" style={{ marginTop: 2 }}>Esses 3 campos só aparecem no PDF "Geral" (sem valores) — o PDF "Financeiro" não mostra.</p>
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
            <label><span>Observações gerais <small style={{ opacity: 0.7 }}>(só no PDF Geral)</small></span><textarea rows={2} value={modal.dados.obsGerais} onChange={(e) => setCampo("obsGerais", e.target.value)} /></label>
            <label><span>Observações financeiro <small style={{ opacity: 0.7 }}>(só no PDF Financeiro — valores, forma de pagamento)</small></span><textarea rows={2} value={modal.dados.obs} onChange={(e) => setCampo("obs", e.target.value)} /></label>

            {sugerirEnvio && modal.editando && (
              <div className="pl-banner" style={{ marginTop: 8, marginBottom: 4 }}>
                OS criada! Enviar por e-mail agora? (abre o Outlook com a mensagem e o PDF prontos)
              </div>
            )}
            {modal.editando && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, marginBottom: 4 }}>
                <select value={destinatario} onChange={(e) => setDestinatario(e.target.value as "geral" | "financeiro")} style={{ border: "1px solid var(--pl-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5 }}>
                  <option value="geral">Enviar para Geral</option>
                  <option value="financeiro">Enviar para Financeiro</option>
                </select>
                <button className="pl-btn" onClick={() => enviarPorEmail({ ...(modal.editando as OS), ...modal.dados })} disabled={enviando}>
                  {enviando ? "Preparando..." : "✉ Enviar por e-mail"}
                </button>
                <button className="pl-btn" onClick={() => enviarPorEmail({ ...(modal.editando as OS), ...modal.dados }, true)} disabled={enviando} title="Abre o Outlook com a mensagem pronta pra editar (o PDF baixa separado, pra anexar antes de enviar)">
                  {enviando ? "Preparando..." : "Editar antes de enviar"}
                </button>
              </div>
            )}

            <div className="pl-toolbar" style={{ marginTop: 4 }}>
              <button className="pl-btn" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              {modal.editando && <button className="pl-btn" onClick={() => baixarPdf({ ...(modal.editando as OS), ...modal.dados }, destinatario)}>Baixar PDF ({destinatario === "geral" ? "Geral" : "Financeiro"})</button>}
              <button className="pl-btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
