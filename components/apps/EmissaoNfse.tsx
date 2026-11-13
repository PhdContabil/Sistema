"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Emissão de NFS-e da PHD (porta do app phd_nfse). Tudo pela tela:
//   1. importar as RPS (CSV do nSQL; API do Questor quando existir);
//   2. marcar e emitir no Portal Nacional (Sefin) — uma por vez, a Sefin não
//      recebe lote; se uma falha, PARA e pergunta;
//   3. o PDF (DANFSe) sai do XML da nota e vai para o Zen logo após a emissão.

interface Nota {
  id: number; rps_serie: string; rps_numero: number; data_prestacao: string; valor: number;
  descricao: string; tomador: { cpf_cnpj: string; razao_social: string; email: string; municipio: string };
  problemas: string[]; status: string; erro: string | null; protocolo: string | null;
  numero_nota: string | null; link_pdf: string | null; pdf_ok: boolean;
  zen_documento_id: string | null; zen_erro: string | null; arquivo: string | null;
  origem: string; pdf_origem?: string | null; criado_em: string; emitido_em: string | null; emitido_por: string | null; questor_ok?: boolean;
}

/** Andamento ao vivo de cada nota durante o envio (uma por vez). */
type Andamento = { estado: "fila" | "enviando" | "aguardando" | "ok" | "erro" | "pulada"; texto?: string };
const ANDAMENTO: Record<Andamento["estado"], [string, string]> = {
  fila: ["Na fila", "badge-soft"], enviando: ["Enviando…", "sit-observar"], aguardando: ["Aguardando Sefin", "sit-observar"],
  ok: ["Enviada ✓", "sit-ok"], erro: ["Falhou", "sit-critico"], pulada: ["Marcada manual", "sit-observar"],
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

const ROTULO: Record<string, [string, string]> = {
  pendente: ["Pendente", "badge-soft"], emitindo: ["Emitindo…", "sit-observar"], emitida: ["Emitida", "sit-ok"],
  erro: ["Erro", "sit-critico"], manual: ["Manual", "sit-observar"], ignorada: ["Ignorada", "badge-soft"],
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CSV do nSQL vem em Windows-1252; se for UTF-8 válido, usa UTF-8. */
async function lerArquivo(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

async function acao(id: number, nome: string) {
  const r = await fetch(`/api/financeiro/nfse/${id}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: nome }),
  });
  return r.json().catch(() => ({ error: `HTTP ${r.status}` }));
}

interface Empresa {
  codigoempresa: number; nome: string; cnpj: string; im: string; c_loc_emi: string; serie: string;
  c_trib_nac: string; c_nbs: string; op_simp_nac: number; p_tot_trib_sn: number | null; ambiente: string;
  cert_validade: string | null; cert_cnpj: string | null; cert_titular: string | null;
  cert_enviado_por: string | null; cert_enviado_em: string | null; falta: string[]; certOk: boolean;
}

/** Nota digitada na tela: tomador com CPF, CNPJ ou sem documento (consumidor final). */
function FormAvulsa({ empresa, onCriada, onErro }: { empresa: number; onCriada: (t: string) => void; onErro: (t: string) => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState<"sem" | "cpf" | "cnpj">("sem");
  const [f, setF] = useState({ documento: "", nome: "", email: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "", valor: "", data: hoje, descricao: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    try {
      const j = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((r) => r.json());
      if (j && !j.erro) setF((x) => ({ ...x, logradouro: x.logradouro || j.logradouro || "", bairro: x.bairro || j.bairro || "", municipio: j.localidade || x.municipio, uf: j.uf || x.uf }));
    } catch { /* preenche à mão */ }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const r = await fetch("/api/financeiro/nfse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "avulsa", empresa, avulsa: { ...f, documento: tipo === "sem" ? "" : f.documento, nome: tipo === "sem" ? "" : f.nome } }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) onErro(j.error ?? "Falha ao criar a nota."); else onCriada(`Nota avulsa AV-${j.numero} criada. Ela está na lista "A emitir": confira, marque e emita.`);
  }

  return (
    <form className="nfse-avulsa" onSubmit={criar}>
      <div className="linha-add">
        <label className="campo-inline"><span>Tomador</span>
          <select className="search" value={tipo} onChange={(e) => setTipo(e.target.value as "sem" | "cpf" | "cnpj")}>
            <option value="sem">Consumidor final (sem documento)</option>
            <option value="cpf">Pessoa física (CPF)</option>
            <option value="cnpj">Empresa (CNPJ)</option>
          </select>
        </label>
        {tipo !== "sem" && <>
          <label className="campo-inline"><span>{tipo === "cpf" ? "CPF" : "CNPJ"}</span><input className="search" style={{ width: 170 }} value={f.documento} onChange={set("documento")} required /></label>
          <label className="campo-inline" style={{ flex: 1 }}><span>Nome / razão social</span><input className="search" style={{ width: "100%" }} value={f.nome} onChange={set("nome")} required /></label>
          <label className="campo-inline"><span>E-mail (opcional)</span><input className="search" type="email" style={{ width: 220 }} value={f.email} onChange={set("email")} /></label>
        </>}
      </div>
      {tipo !== "sem" && (
        <div className="linha-add">
          <label className="campo-inline"><span>CEP{tipo === "cnpj" ? "" : " (opcional)"}</span><input className="search" style={{ width: 110 }} value={f.cep} onChange={set("cep")} onBlur={(e) => buscarCep(e.target.value)} required={tipo === "cnpj"} /></label>
          <label className="campo-inline" style={{ flex: 1 }}><span>Logradouro</span><input className="search" style={{ width: "100%" }} value={f.logradouro} onChange={set("logradouro")} required={tipo === "cnpj"} /></label>
          <label className="campo-inline"><span>Número</span><input className="search" style={{ width: 80 }} value={f.numero} onChange={set("numero")} /></label>
          <label className="campo-inline"><span>Complemento</span><input className="search" style={{ width: 120 }} value={f.complemento} onChange={set("complemento")} /></label>
          <label className="campo-inline"><span>Bairro</span><input className="search" style={{ width: 160 }} value={f.bairro} onChange={set("bairro")} required={tipo === "cnpj"} /></label>
          <label className="campo-inline"><span>Município / UF</span><input className="search" style={{ width: 190 }} value={f.municipio ? `${f.municipio}${f.uf ? ` / ${f.uf}` : ""}` : ""} readOnly placeholder="pelo CEP" /></label>
        </div>
      )}
      <div className="linha-add">
        <label className="campo-inline"><span>Valor (R$)</span><input className="search" style={{ width: 130 }} inputMode="decimal" placeholder="0,00" value={f.valor} onChange={set("valor")} required /></label>
        <label className="campo-inline"><span>Data de prestação / competência</span><input className="search" type="date" max={hoje} value={f.data} onChange={set("data")} required /></label>
      </div>
      <label className="campo"><span>Descrição do serviço</span><textarea rows={3} value={f.descricao} onChange={set("descricao")} required maxLength={2000} /></label>
      <label className="campo"><span>Observações na nota (opcional)</span><input className="search" style={{ width: "100%" }} value={f.observacao} onChange={set("observacao")} /></label>
      <div className="fp-acoes">
        <button className="btn primary" type="submit" disabled={salvando || !empresa}>{salvando ? "Criando…" : "Criar nota avulsa"}</button>
        <span className="sub-info">A nota não é enviada agora: entra na lista como pendente, com numeração própria (AV), para você conferir e emitir.</span>
      </div>
    </form>
  );
}

/** Dados fiscais e certificado A1 da empresa. O certificado só sobe: nunca é mostrado de volta. */
function ConfigEmpresa({ emp, onSalvo, onErro }: { emp: Empresa; onSalvo: (t: string) => void; onErro: (t: string) => void }) {
  const [f, setF] = useState({
    im: emp.im, c_loc_emi: emp.c_loc_emi, serie: emp.serie, c_trib_nac: emp.c_trib_nac, c_nbs: emp.c_nbs,
    op_simp_nac: String(emp.op_simp_nac), p_tot_trib_sn: emp.p_tot_trib_sn != null ? String(emp.p_tot_trib_sn) : "", ambiente: emp.ambiente,
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof typeof f, rot: string, dica?: string, larg = 150) => (
    <label className="campo-inline"><span>{rot}</span>
      <input className="search" style={{ width: larg }} value={f[k]} placeholder={dica} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );

  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/financeiro/nfse/empresas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: emp.codigoempresa, config: { ...f, op_simp_nac: Number(f.op_simp_nac), p_tot_trib_sn: f.p_tot_trib_sn === "" ? null : f.p_tot_trib_sn } }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) onErro(j.error ?? "Falha ao salvar."); else onSalvo(`Configuração da ${emp.nome} salva.`);
  }

  async function enviarCert() {
    if (!arquivo || !senha) { onErro("Escolha o arquivo .pfx e digite a senha."); return; }
    setSalvando(true);
    const fd = new FormData();
    fd.set("empresa", String(emp.codigoempresa)); fd.set("arquivo", arquivo); fd.set("senha", senha);
    const r = await fetch("/api/financeiro/nfse/empresas", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { onErro(j.error ?? "Falha ao enviar o certificado."); return; }
    setArquivo(null); setSenha("");
    onSalvo(`Certificado de ${j.titular} (CNPJ ${j.cnpj}) salvo. Válido até ${new Date(j.validade).toLocaleDateString("pt-BR")}.`);
  }

  async function removerCert() {
    if (!window.confirm(`Remover o certificado da ${emp.nome}? Ela deixa de emitir até enviar outro.`)) return;
    const r = await fetch("/api/financeiro/nfse/empresas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: emp.codigoempresa, removerCertificado: true }) });
    if (r.ok) onSalvo("Certificado removido."); else onErro("Falha ao remover.");
  }

  return (
    <section className="bloco-edit nfse-config">
      <h3>Configuração — {emp.nome}</h3>
      <div className="nfse-config-grid">
        <div>
          <h4>Dados para a nota</h4>
          <div className="linha-add">
            {campo("im", "Inscrição municipal", "", 120)}
            {campo("c_loc_emi", "IBGE do município", "7 dígitos", 110)}
            {campo("serie", "Série da DPS", "1", 70)}
            {campo("c_trib_nac", "Cód. tributação nacional", "ex.: 171901", 130)}
            {campo("c_nbs", "NBS (opcional)", "9 dígitos", 120)}
          </div>
          <div className="linha-add">
            <label className="campo-inline"><span>Regime</span>
              <select className="search" value={f.op_simp_nac} onChange={(e) => setF({ ...f, op_simp_nac: e.target.value })}>
                <option value="3">Simples Nacional (ME/EPP)</option>
                <option value="2">MEI</option>
                <option value="1">Não optante (Presumido/Real)</option>
              </select>
            </label>
            {f.op_simp_nac === "3" && campo("p_tot_trib_sn", "% tributos do Simples", "ex.: 6,00", 110)}
            <label className="campo-inline"><span>Ambiente</span>
              <select className="search" value={f.ambiente} onChange={(e) => setF({ ...f, ambiente: e.target.value })}>
                <option value="homologacao">Teste (produção restrita)</option>
                <option value="producao">Produção (vale de verdade)</option>
              </select>
            </label>
          </div>
          {f.op_simp_nac === "1" && <p className="sub-info" style={{ color: "#dc2626" }}>Atenção: para não optante o Núcleo ainda não calcula retenções federais (IRRF, CSRF, INSS) na nota.</p>}
          <button className="btn primary" disabled={salvando} onClick={salvar}>Salvar dados</button>
        </div>
        <div>
          <h4>Certificado A1 (e-CNPJ)</h4>
          <p className="sub-info">
            {emp.cert_validade
              ? <>Atual: <strong>{emp.cert_titular}</strong> · CNPJ {emp.cert_cnpj} · válido até {new Date(emp.cert_validade).toLocaleDateString("pt-BR")} · enviado por {emp.cert_enviado_por?.split("@")[0]}</>
              : "Nenhum certificado enviado."}
          </p>
          <div className="linha-add">
            <label className="btn">{arquivo ? arquivo.name : "Escolher .pfx"}
              <input type="file" accept=".pfx,.p12" hidden onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <input className="search" type="password" autoComplete="new-password" placeholder="Senha do certificado" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <button className="btn primary" disabled={salvando || !arquivo || !senha} onClick={enviarCert}>Enviar certificado</button>
            {emp.cert_validade && <button className="btn" disabled={salvando} onClick={removerCert}>Remover</button>}
          </div>
          <p className="sub-info">O sistema confere a senha, a validade e se o CNPJ é o da empresa. O arquivo fica guardado cifrado no servidor e não aparece mais na tela.</p>
        </div>
      </div>
    </section>
  );
}

export default function EmissaoNfse() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresa, setEmpresa] = useState<number>(() => {
    try { return Number(window.localStorage.getItem("nfse-empresa")) || 0; } catch { return 0; }
  });
  const [zen, setZen] = useState(true);
  const [abrirCfg, setAbrirCfg] = useState(false);
  const [abrirAvulsa, setAbrirAvulsa] = useState(false);
  const emp = empresas.find((e) => e.codigoempresa === empresa) ?? null;
  // Mantém os nomes usados no resto da tela.
  const cfg = { credenciais: !!emp?.certOk, pTotTribSN: !!emp && emp.falta.length === 0, ambiente: emp?.ambiente === "producao" ? 1 : 2, zen };
  const [filtro, setFiltro] = useState("abertas");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pausa, setPausa] = useState<{ nota: Nota; erro: string } | null>(null);
  const [andamento, setAndamento] = useState<Record<number, Andamento>>({});
  const marcar = (id: number, a: Andamento) => { andamentoRef.current = { ...andamentoRef.current, [id]: a }; setAndamento((m) => ({ ...m, [id]: a })); };
  const [faixa, setFaixa] = useState({ rps_inicio: "", rps_fim: "", data_inicio: "", data_fim: "" });
  const [dataManual, setDataManual] = useState("");
  /** Faixa de RPS da última busca: a lista mostra só ela, até o usuário pedir todas. */
  const [faixaLista, setFaixaLista] = useState<{ de: number; ate: number } | null>(null);
  const decisao = useRef<((d: "repetir" | "pular" | "manual" | "parar") => void) | null>(null);
  const pularErros = useRef(false);
  const [pularAuto, setPularAuto] = useState(false);
  const [paralelo, setParalelo] = useState(5);
  const [barra, setBarra] = useState<{ feitas: number; total: number; ok: number; erro: number; puladas: number; manual: number; etapa: string } | null>(null);
  const andamentoRef = useRef<Record<number, Andamento>>({});
  const parar = useRef(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/financeiro/nfse${empresa ? `?empresa=${empresa}` : ""}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao carregar." }); return; }
    setNotas(j.notas ?? []); setEmpresas(j.empresas ?? []); setZen(!!j.zen);
    if (!empresa && j.empresa) setEmpresa(j.empresa);
  }, [empresa]);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => notas.filter((n) => !faixaLista || (n.rps_numero >= faixaLista.de && n.rps_numero <= faixaLista.ate)).filter((n) =>
    filtro === "todas" ? true
      : filtro === "abertas" ? ["pendente", "erro", "emitindo"].includes(n.status)
      : filtro === "emitidas" ? ["emitida", "manual"].includes(n.status)
      : filtro === "sem-pdf" ? n.status === "emitida" && (!n.pdf_ok || n.pdf_origem === "local" || (!n.zen_documento_id && cfg.zen))
      : n.status === filtro), [notas, filtro, cfg.zen, faixaLista]);

  const emitiveis = visiveis.filter((n) => ["pendente", "erro"].includes(n.status) && n.problemas.length === 0);
  const contagem = (f: (n: Nota) => boolean) => notas.filter(f).length;

  async function importarCsv(f: File) {
    setOcupado(true); setMsg(null);
    const texto = await lerArquivo(f);
    const r = await fetch("/api/financeiro/nfse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "csv", empresa, texto, arquivo: f.name, data_manual: dataManual || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao importar." }); return; }
    setMsg({ ok: true, texto: `${f.name}: ${j.gravadas} RPS importada(s)${j.comProblema ? `, ${j.comProblema} com problema` : ""}${j.jaEmitidas ? `, ${j.jaEmitidas} já emitida(s) (mantidas)` : ""}.` });
    setFiltro("abertas"); carregar();
  }

  async function buscarQuestor() {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/financeiro/nfse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "questor", empresa, ...faixa, rps_inicio: Number(faixa.rps_inicio) || undefined, rps_fim: Number(faixa.rps_fim) || undefined, data_manual: dataManual || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao buscar no Questor." }); return; }
    const de = Number(faixa.rps_inicio) || 0, ate = Number(faixa.rps_fim) || de;
    if (de) { setFaixaLista({ de, ate: Math.max(de, ate) }); setFiltro("todas"); }
    setSel(new Set());
    setMsg({ ok: true, texto: `${j.gravadas} RPS vieram do Questor${j.comProblema ? `, ${j.comProblema} com problema` : ""}${j.jaEmitidas ? `; ${j.jaEmitidas} já emitida(s), mantida(s) como estão` : ""}.` });
    carregar();
  }

  async function ignorarSelecionadas() {
    if (sel.size === 0 || !window.confirm(`Tirar ${sel.size} RPS da lista de emissão? Elas vão para "Ignoradas" e dá para voltar depois.`)) return;
    setOcupado(true);
    for (const id of sel) await acao(id, "ignorar");
    setOcupado(false); setSel(new Set()); carregar();
  }

  /** Para o lote e pergunta o que fazer (como o app Python). */
  function perguntar(nota: Nota, erro: string) {
    return new Promise<"repetir" | "pular" | "manual" | "parar">((resolve) => {
      setPausa({ nota, erro });
      decisao.current = (d) => { setPausa(null); decisao.current = null; resolve(d); };
    });
  }

  /**
   * Envia as marcadas ao Portal Nacional. A Sefin recebe uma DPS por chamada
   * (não existe lote na API), então o "lote" aqui são várias chamadas ao mesmo
   * tempo — `paralelo` de cada vez. No Padrão Nacional não há sequência a
   * respeitar (o nDPS só precisa ser único), então pular uma nota com erro não
   * atrapalha as outras: ela fica "com erro" para arrumar e emitir depois.
   */
  async function emitirSelecionadas() {
    const fila = notas.filter((n) => sel.has(n.id)).sort((a, b) => a.rps_numero - b.rps_numero);
    if (fila.length === 0) return;
    if (!window.confirm(`Emitir ${fila.length} nota(s) da ${emp?.nome ?? "empresa"} no Portal Nacional${cfg.ambiente === 1 ? " (PRODUÇÃO)" : " (TESTE - produção restrita)"}, ${paralelo} de cada vez?\n\nIsso gera NFS-e de verdade.`)) return;
    setOcupado(true); setMsg(null); parar.current = false;
    setAndamento(Object.fromEntries(fila.map((n) => [n.id, { estado: "fila" } as Andamento])));
    const cont = { ok: 0, erro: 0, puladas: 0, manual: 0 };
    const total = fila.length;
    let proximo = 0, feitasTotal = 0;
    let portao: Promise<void> | null = null; // fecha enquanto o usuário decide um erro
    const atualizar = () => setBarra({ feitas: feitasTotal, total, ...cont, etapa: "Enviando ao Portal Nacional" });
    atualizar();

    const trabalhador = async () => {
      for (;;) {
        if (portao) await portao;
        if (parar.current || proximo >= total) return;
        const n = fila[proximo++];
        for (;;) {
          marcar(n.id, { estado: "enviando" });
          const r = await acao(n.id, "emitir");
          if (r.ok) { cont.ok++; marcar(n.id, { estado: "ok", texto: r.numero ? `NFS-e ${r.numero}` : undefined }); break; }
          const erro = r.erro ?? r.error ?? "Falha.";
          marcar(n.id, { estado: "erro", texto: erro });
          if (pularErros.current) { cont.puladas++; break; }
          let abrir!: () => void;
          const meu = new Promise<void>((res) => { abrir = res; });
          portao = meu;
          const d = await perguntar(n, erro);
          portao = null; abrir();
          if (d === "repetir") continue;
          if (d === "pular") { cont.puladas++; break; }
          if (d === "manual") { await acao(n.id, "manual"); cont.manual++; marcar(n.id, { estado: "pulada" }); break; }
          parar.current = true; break;
        }
        feitasTotal++; atualizar();
      }
    };
    await Promise.all(Array.from({ length: Math.min(paralelo, total) }, trabalhador));
    await carregar();

    // Em seguida, PDF oficial + Zen + Questor das que acabaram de sair (o que não fechar, o agendador retoma a cada 10 min).
    const emitidas = fila.filter((n) => andamentoRef.current[n.id]?.estado === "ok");
    let pdfOk = 0, pdfPend = 0, k = 0;
    const tPdf = async () => {
      while (k < emitidas.length) {
        const n = emitidas[k++];
        const r = await acao(n.id, "pdf");
        if (r.status === "ok") pdfOk++; else pdfPend++;
        setBarra({ feitas: pdfOk + pdfPend, total: emitidas.length, ok: pdfOk, erro: 0, puladas: pdfPend, manual: 0, etapa: "PDF oficial e Zen" });
      }
    };
    if (emitidas.length) await Promise.all(Array.from({ length: Math.min(3, emitidas.length) }, tPdf));

    setBarra(null); setOcupado(false); setSel(new Set());
    setAndamento((m) => Object.fromEntries(Object.entries(m).filter(([, a]) => a.estado !== "fila")));
    setMsg({
      ok: cont.erro === 0 && cont.puladas === 0,
      texto: `${cont.ok} nota(s) emitida(s)${cont.puladas ? `, ${cont.puladas} com erro (ficaram na lista para arrumar)` : ""}${cont.manual ? `, ${cont.manual} marcada(s) manual` : ""}${parar.current ? " — lote interrompido" : ""}. `
        + (emitidas.length ? `PDF/Zen: ${pdfOk} ok${pdfPend ? `, ${pdfPend} aguardando o PDF oficial do Portal (o sistema tenta sozinho a cada 10 min)` : ""}.` : ""),
    });
    carregar();
  }

  async function baixarPdfs() {
    const fila = notas.filter((n) => n.status === "emitida" && (!n.pdf_ok || n.pdf_origem === "local" || (!n.zen_documento_id && cfg.zen)))
      .sort((a, b) => a.rps_numero - b.rps_numero);
    if (fila.length === 0) { setMsg({ ok: true, texto: "Nenhuma nota esperando PDF ou Zen." }); return; }
    setOcupado(true); setMsg(null);
    const cont = { ok: 0, pendente: 0, erro: 0 };
    for (let i = 0; i < fila.length; i++) {
      setProgresso(`PDF da RPS ${fila[i].rps_numero} (${i + 1} de ${fila.length})…`);
      const r = await acao(fila[i].id, "pdf");
      if (r.status === "ok") cont.ok++; else if (r.status === "pendente" || r.status === "manutencao") cont.pendente++; else cont.erro++;
      if (r.status === "manutencao") break;
    }
    setProgresso(null); setOcupado(false);
    setMsg({ ok: cont.erro === 0, texto: `${cont.ok} PDF(s) ok${cont.pendente ? `, ${cont.pendente} ainda sem XML na Sefin (tente em alguns minutos)` : ""}${cont.erro ? `, ${cont.erro} com erro (veja na lista)` : ""}.` });
    carregar();
  }

  async function porNota(n: Nota, nome: string) {
    if (nome === "manual" && !window.confirm(`Marcar a RPS ${n.rps_numero} como emitida manualmente no portal?`)) return;
    const r = await acao(n.id, nome);
    if (r.error || r.erro) setMsg({ ok: false, texto: r.error ?? r.erro });
    else if (r.mensagem) setMsg({ ok: r.status === "ok", texto: r.mensagem });
    carregar();
  }

  const todasMarcadas = emitiveis.length > 0 && emitiveis.every((n) => sel.has(n.id));

  return (
    <>
      <section className="bloco-edit nfse-empresa">
        <label>
          <span className="sub-info">Empresa emissora</span>
          <select className="search" value={empresa} disabled={ocupado}
                  onChange={(e) => { const v = Number(e.target.value); setEmpresa(v); setSel(new Set()); setAndamento({}); try { window.localStorage.setItem("nfse-empresa", String(v)); } catch { /* sem storage */ } }}>
            {empresas.map((e) => <option key={e.codigoempresa} value={e.codigoempresa}>{e.nome} — {e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</option>)}
          </select>
        </label>
        {emp && (
          <div className="nfse-empresa-sit">
            <span className={`badge ${cfg.ambiente === 1 ? "sit-ok" : "sit-observar"}`}>{cfg.ambiente === 1 ? "Produção" : "Teste (produção restrita)"}</span>
            <span className={`badge ${emp.certOk ? "sit-ok" : "sit-critico"}`}>
              {emp.certOk ? `Certificado válido até ${new Date(emp.cert_validade!).toLocaleDateString("pt-BR")}` : emp.cert_validade ? "Certificado vencido" : "Sem certificado"}
            </span>
            {emp.falta.length > 0 && <span className="badge sit-critico">Falta: {emp.falta.join(", ")}</span>}
          </div>
        )}
        <button className="btn" onClick={() => setAbrirCfg((v) => !v)}>{abrirCfg ? "Fechar configuração" : "Configuração"}</button>
      </section>
      {abrirCfg && emp && <ConfigEmpresa key={emp.codigoempresa} emp={emp} onSalvo={(t) => { setMsg({ ok: true, texto: t }); carregar(); }} onErro={(t) => setMsg({ ok: false, texto: t })} />}
      {emp && (!emp.certOk || emp.falta.length > 0) && !abrirCfg && (
        <div className="banner error">A {emp.nome} ainda não pode emitir: abra <strong>Configuração</strong> para enviar o certificado A1 e completar os dados. Dá para importar e conferir as RPS enquanto isso.</div>
      )}
      {!cfg.zen && <div className="banner">Token do Zen não configurado: os PDFs não serão publicados no Edoc.</div>}
      {msg && <div className={`banner ${msg.ok ? "" : "error"}`}>{msg.texto}</div>}
      {progresso && <div className="banner">{progresso}</div>}
      {barra && (
        <div className="nfse-progresso">
          <div className="nfse-progresso-topo">
            <strong>{barra.etapa}: {barra.feitas} de {barra.total} ({Math.round((barra.feitas / Math.max(1, barra.total)) * 100)}%)</strong>
            <span className="sub-info">
              {barra.ok} ok{barra.puladas ? ` · ${barra.puladas} ${barra.etapa.startsWith("PDF") ? "aguardando" : "com erro"}` : ""}{barra.manual ? ` · ${barra.manual} manual` : ""}
            </span>
            {barra.etapa.startsWith("Enviando") && <button className="btn" onClick={() => { parar.current = true; }}>Parar</button>}
          </div>
          <div className="nfse-progresso-trilho"><div className="nfse-progresso-barra" style={{ width: `${(barra.feitas / Math.max(1, barra.total)) * 100}%` }} /></div>
        </div>
      )}

      {pausa && (
        <div className="banner error nfse-pausa">
          <strong>Erro na RPS {pausa.nota.rps_numero} ({pausa.nota.tomador.razao_social}). O envio das próximas está esperando você decidir.</strong>
          <div style={{ margin: "6px 0" }}>{pausa.erro}</div>
          <div className="fp-acoes">
            <button className="btn primary" onClick={() => decisao.current?.("pular")}>Pular esta e seguir (arrumo depois)</button>
            <button className="btn" onClick={() => decisao.current?.("repetir")}>Corrigi, tentar de novo</button>
            <button className="btn" onClick={() => decisao.current?.("manual")}>Emiti no portal: marcar manual e seguir</button>
            <button className="btn" onClick={() => decisao.current?.("parar")}>Parar o lote</button>
          </div>
        </div>
      )}

      <section className="bloco-edit">
        <h3>1. Importar RPS</h3>
        <div className="nfse-import">
          <label className="btn">
            Enviar CSV do nSQL
            <input type="file" accept=".csv,text/csv" hidden disabled={ocupado}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) importarCsv(f); e.target.value = ""; }} />
          </label>
          <span className="sub-info">ou buscar no Questor:</span>
          <input className="search" style={{ width: 90 }} placeholder="RPS de" value={faixa.rps_inicio} onChange={(e) => setFaixa({ ...faixa, rps_inicio: e.target.value })} />
          <input className="search" style={{ width: 90 }} placeholder="até" value={faixa.rps_fim} onChange={(e) => setFaixa({ ...faixa, rps_fim: e.target.value })} />
          <input className="search" type="date" value={faixa.data_inicio} onChange={(e) => setFaixa({ ...faixa, data_inicio: e.target.value })} title="Prestação de" />
          <input className="search" type="date" value={faixa.data_fim} onChange={(e) => setFaixa({ ...faixa, data_fim: e.target.value })} title="até" />
          <button className="btn" disabled={ocupado} onClick={buscarQuestor}>Buscar no Questor</button>
        </div>
        <div className="nfse-import" style={{ marginTop: 10 }}>
          <span className="sub-info"><strong>Data de prestação / competência</strong> (opcional, exceção do mês atual):</span>
          <input className="search" type="date" value={dataManual} max={new Date().toISOString().slice(0, 10)}
                 onChange={(e) => setDataManual(e.target.value)} title="Vale para todas as RPS importadas agora" />
          {dataManual && <button className="btn" onClick={() => setDataManual("")}>Usar a data do Questor</button>}
        </div>
        <p className="sub-info">
          Se preencher a data, ela substitui a do Questor em todas as RPS desta importação (dá para ajustar uma a uma na lista).
          Reimportar é seguro: RPS já emitida não é tocada.
        </p>
      </section>

      <section className="bloco-edit" style={{ marginTop: 16 }}>
        <div className="nfse-barra">
          <h3 style={{ margin: 0 }}>Nota avulsa / consumidor final</h3>
          <button className="btn" onClick={() => setAbrirAvulsa((v) => !v)}>{abrirAvulsa ? "Fechar" : "Nova nota avulsa"}</button>
        </div>
        {abrirAvulsa && <FormAvulsa empresa={empresa} onCriada={(t) => { setMsg({ ok: true, texto: t }); setAbrirAvulsa(false); setFaixaLista(null); setFiltro("abertas"); carregar(); }} onErro={(t) => setMsg({ ok: false, texto: t })} />}
      </section>

      <section className="bloco-edit" style={{ marginTop: 16 }}>
        <div className="nfse-barra">
          <div className="nfse-filtros">
            {[["abertas", `A emitir (${contagem((n) => ["pendente", "erro", "emitindo"].includes(n.status))})`],
              ["sem-pdf", `Sem PDF/Zen (${contagem((n) => n.status === "emitida" && (!n.pdf_ok || n.pdf_origem === "local" || (!n.zen_documento_id && cfg.zen)))})`],
              ["emitidas", `Emitidas (${contagem((n) => ["emitida", "manual"].includes(n.status))})`],
              ["ignorada", "Ignoradas"], ["todas", "Todas"]].map(([id, rot]) => (
              <button key={id} className={`btn${filtro === id ? " primary" : ""}`} onClick={() => setFiltro(id)}>{rot}</button>
            ))}
          </div>
          <div className="fp-acoes">
            <label className="nfse-opcao" title="Quantas notas vão ao Portal ao mesmo tempo">
              Simultâneas
              <select className="search" value={paralelo} disabled={ocupado} onChange={(e) => setParalelo(Number(e.target.value))}>
                {[1, 3, 5, 10].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="nfse-opcao" title="Nota com erro fica na lista para arrumar; o envio segue com as outras">
              <input type="checkbox" checked={pularAuto} disabled={ocupado} onChange={(e) => { setPularAuto(e.target.checked); pularErros.current = e.target.checked; }} />
              Pular as com erro
            </label>
            <button className="btn primary" disabled={ocupado || sel.size === 0 || !cfg.credenciais || !cfg.pTotTribSN} onClick={emitirSelecionadas}>
              2. Emitir selecionadas ({sel.size})
            </button>
            <button className="btn" disabled={ocupado || sel.size === 0} onClick={ignorarSelecionadas}>Ignorar selecionadas</button>
            <button className="btn" disabled={ocupado} onClick={baixarPdfs}>Refazer PDF/Zen pendentes</button>
          </div>
        </div>

        {faixaLista && (
          <div className="banner">
            Mostrando só as RPS <strong>{faixaLista.de}</strong>{faixaLista.ate !== faixaLista.de ? <> a <strong>{faixaLista.ate}</strong></> : null} da última busca.{" "}
            <button className="btn" onClick={() => { setFaixaLista(null); setFiltro("abertas"); setSel(new Set()); }}>Ver todas</button>
          </div>
        )}
        <div className="table-wrap nfse-tabela-wrap" style={{ boxShadow: "none" }}>
          <table className="grid nfse-tabela">
            <colgroup>
              <col style={{ width: 34 }} /><col style={{ width: 80 }} /><col style={{ width: 128 }} /><col />
              <col style={{ width: 96 }} /><col style={{ width: 120 }} /><col style={{ width: 175 }} /><col style={{ width: 120 }} /><col style={{ width: 118 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="c-res">
                  <input type="checkbox" checked={todasMarcadas} disabled={emitiveis.length === 0}
                         onChange={() => setSel(todasMarcadas ? new Set() : new Set(emitiveis.map((n) => n.id)))} />
                </th>
                <th>RPS</th>
                <th>Prestação</th>
                <th className="col-empresa">Tomador</th>
                <th className="num">Valor</th>
                <th className="c-res">Situação</th>
                <th>Histórico</th>
                <th>NFS-e / Zen</th>
                <th className="c-res">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && <tr><td colSpan={9} className="vazio">Nada aqui. Importe o CSV do nSQL para começar.</td></tr>}
              {visiveis.map((n) => {
                const [rot, cls] = ROTULO[n.status] ?? [n.status, "badge-soft"];
                const marcavel = ["pendente", "erro"].includes(n.status) && n.problemas.length === 0;
                return (
                  <tr key={n.id}>
                    <td className="c-res">
                      <input type="checkbox" disabled={!marcavel || ocupado} checked={sel.has(n.id)}
                             onChange={() => setSel((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })} />
                    </td>
                    <td className="mono">{n.rps_serie}-{n.rps_numero}</td>
                    <td>
                      {["pendente", "erro", "ignorada"].includes(n.status) ? (
                        <input className="search nfse-data" type="date" value={n.data_prestacao} disabled={ocupado}
                               max={new Date().toISOString().slice(0, 10)}
                               onChange={async (e) => {
                                 const r = await fetch(`/api/financeiro/nfse/${n.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "data", data: e.target.value }) });
                                 const j = await r.json().catch(() => ({}));
                                 if (!r.ok || j.error) setMsg({ ok: false, texto: j.error ?? "Falha ao mudar a data." });
                                 carregar();
                               }} />
                      ) : dataBR(n.data_prestacao)}
                    </td>
                    <td className="col-empresa">
                      <span className="emp-nome">{n.tomador.razao_social}</span>
                      <span className="obs">{n.tomador.cpf_cnpj} · {n.tomador.municipio}{n.tomador.email ? ` · ${n.tomador.email}` : ""}</span>
                      {n.problemas.length > 0 && <span className="obs nfse-erro">{n.problemas.join(" · ")}</span>}
                      {n.erro && n.status !== "emitida" && <span className="obs nfse-erro">{n.erro}</span>}
                    </td>
                    <td className="num">{brl(n.valor)}</td>
                    <td className="c-res">
                      {andamento[n.id] ? (
                        <>
                          <span className={`badge ${ANDAMENTO[andamento[n.id].estado][1]}`}>{ANDAMENTO[andamento[n.id].estado][0]}</span>
                          {andamento[n.id].texto && <span className="obs">{andamento[n.id].texto}</span>}
                        </>
                      ) : <span className={`badge ${cls}`}>{rot}</span>}
                    </td>
                    <td className="nfse-hist">
                      <span className="obs">Sincronizada {dataHora(n.criado_em)} ({n.origem === "questor" ? "Questor" : n.origem === "avulsa" ? "avulsa" : "CSV"})</span>
                      {n.emitido_em && <span className="obs">{n.status === "manual" ? "Manual" : "Enviada ao Portal Nacional"} {dataHora(n.emitido_em)}{n.emitido_por ? ` por ${n.emitido_por.split("@")[0]}` : ""}</span>}
                      {n.pdf_ok && <span className={`obs ${n.pdf_origem === "local" ? "nfse-erro" : ""}`}>{n.pdf_origem === "oficial" ? "PDF oficial do Portal" : n.pdf_origem === "local" ? "PDF provisório (Portal não devolveu o oficial)" : "PDF gerado"}</span>}
                      {n.questor_ok && <span className="obs nfse-ok">Número gravado no Questor</span>}
                    </td>
                    <td>
                      {n.numero_nota ? <span>NFS-e <strong>{n.numero_nota}</strong></span> : n.protocolo ? <span className="obs">protocolo {n.protocolo}</span> : <span className="dash">–</span>}
                      {n.status === "emitida" && <> · <a href={`/api/financeiro/nfse/${n.id}`} target="_blank" rel="noopener noreferrer">PDF</a></>}
                      {n.zen_documento_id && <span className="obs nfse-ok">no Zen</span>}
                      {n.zen_erro && !n.zen_documento_id && <span className="obs nfse-erro">Zen: {n.zen_erro}</span>}
                    </td>
                    <td className="c-res nfse-acoes">
                      {["emitida", "manual"].includes(n.status) && (!n.pdf_ok || !n.zen_documento_id) && (
                        <button className="btn" disabled={ocupado} onClick={() => porNota(n, "pdf")}>PDF/Zen</button>
                      )}
                      {["pendente", "erro"].includes(n.status) && (
                        <>
                          {n.problemas.length === 0 && cfg.credenciais && (
                            <button className="btn" disabled={ocupado} onClick={() => porNota(n, "verificar")} title="Confere dados, IBGE e certificado sem emitir">Conferir</button>
                          )}
                          <button className="btn" disabled={ocupado} onClick={() => porNota(n, "manual")} title="Emitida direto no portal">Manual</button>
                          <button className="btn" disabled={ocupado} onClick={() => porNota(n, "ignorar")} title="Não emitir">Ignorar</button>
                        </>
                      )}
                      {n.status === "ignorada" && <button className="btn" onClick={() => porNota(n, "voltar")}>Voltar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="sub-info" style={{ marginTop: 8 }}>
          Envio uma a uma no Portal Nacional (o número da DPS é o da RPS). Se uma nota falhar, o lote para e pergunta.
          Para cancelar uma NFS-e já emitida, use o Emissor Nacional (www.nfse.gov.br).
        </p>
      </section>
    </>
  );
}
