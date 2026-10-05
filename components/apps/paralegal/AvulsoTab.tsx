"use client";

// Cadastro Avulso — migrado do formCadastroAvulso do Access ("Cadastro de
// Questor" aberto pelo botão Cliente Avulso). Diferente do Cadastro de
// Empresa: NÃO cria empresa no Questor, só a pessoa/cliente no FINANCEIRO
// (pessoa, pessoafinanceiro, endereço, contatos, pessoafincliente e
// servicocontrato). Mesmos campos do formulário antigo.
import { useEffect, useState } from "react";

interface LookupItem { codigo: string | number; descricao: string; [k: string]: unknown }

function somenteDigitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}
function mascararCnpj(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (d.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (d.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
}
function mascararCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  let out = d;
  if (d.length > 3) out = d.slice(0, 3) + "." + d.slice(3);
  if (d.length > 6) out = out.slice(0, 7) + "." + out.slice(7);
  if (d.length > 9) out = out.slice(0, 11) + "-" + out.slice(11);
  return out;
}
function mascararCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
}
function normalizar(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const VAZIO = {
  nome: "",
  inscrfederal: "",
  cep: "",
  codigotipolograd: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  siglaestado: "",
  codigomunic: "",
  dddfone: "",
  numerofone: "",
  email: "",
};
type Dados = typeof VAZIO;

const LABEL: Record<keyof Dados, string> = {
  nome: "Razão social / Nome",
  inscrfederal: "CNPJ/CPF",
  cep: "CEP",
  codigotipolograd: "Tipo de logradouro",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  siglaestado: "Estado",
  codigomunic: "Cidade",
  dddfone: "DDD",
  numerofone: "Telefone",
  email: "E-mail",
};
// Igual ao Access: todos em negrito são obrigatórios (só o complemento não).
const OBRIGATORIOS: (keyof Dados)[] = ["nome", "inscrfederal", "cep", "codigotipolograd", "endereco", "numero", "bairro", "siglaestado", "codigomunic", "dddfone", "numerofone", "email"];

export default function AvulsoTab() {
  const [tipoDoc, setTipoDoc] = useState<"cnpj" | "cpf">("cnpj");
  const [dados, setDados] = useState<Dados>({ ...VAZIO });
  const [logradouros, setLogradouros] = useState<LookupItem[]>([]);
  const [estados, setEstados] = useState<LookupItem[]>([]);
  const [municipios, setMunicipios] = useState<LookupItem[]>([]);
  const [status, setStatus] = useState<{ texto: string; tipo: "" | "ok" | "erro" }>({ texto: "", tipo: "" });
  const [faltando, setFaltando] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: "ok" | "erro" } | null>(null);

  function campo(k: keyof Dados, v: string) {
    setDados((d) => ({ ...d, [k]: v }));
  }

  async function buscarLookup(tipo: string, params?: Record<string, string>): Promise<LookupItem[]> {
    const qs = new URLSearchParams({ tipo, ...(params ?? {}) });
    const r = await fetch(`/api/paralegal/cadastro-empresa/lookups?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Erro ao consultar o Questor.");
    return Array.isArray(j.dados) ? j.dados : [];
  }

  useEffect(() => {
    buscarLookup("tipos-logradouro").then(setLogradouros).catch(() => {});
    buscarLookup("estados").then(setEstados).catch(() => {});
  }, []);

  async function trocarEstado(uf: string, municipioNome?: string) {
    setDados((d) => ({ ...d, siglaestado: uf, codigomunic: "" }));
    if (!uf) { setMunicipios([]); return; }
    try {
      const lista = await buscarLookup("municipios", { uf });
      setMunicipios(lista);
      if (municipioNome) {
        const alvo = normalizar(municipioNome);
        const achado = lista.find((m) => normalizar(m.descricao) === alvo);
        if (achado) campo("codigomunic", String(achado.codigo));
      }
    } catch { setMunicipios([]); }
  }

  function acharTipoLogradouro(descricao: string): string {
    const alvo = normalizar(descricao);
    const achado = logradouros.find((o) => normalizar(o.descricao) === alvo);
    return achado ? String(achado.codigo) : "";
  }

  // CEP completo -> preenche endereço (no Access era a busca nos Correios).
  async function buscarCep(cepDigitos: string) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepDigitos}/json/`);
      const d = await r.json();
      if (!r.ok || d.erro) { setStatus({ texto: "Endereço não encontrado para esse CEP.", tipo: "erro" }); return; }
      const logradouro: string = d.logradouro || "";
      const primeira = logradouro.split(" ")[0] || "";
      const tipo = acharTipoLogradouro(primeira);
      setDados((p) => ({
        ...p,
        codigotipolograd: tipo || p.codigotipolograd,
        endereco: tipo ? logradouro.slice(primeira.length).trim() : logradouro || p.endereco,
        bairro: d.bairro || p.bairro,
      }));
      if (d.uf) await trocarEstado(d.uf, d.localidade);
      setStatus({ texto: "Endereço preenchido pelo CEP. Confira.", tipo: "ok" });
    } catch {
      setStatus({ texto: "Não foi possível consultar o CEP.", tipo: "erro" });
    }
  }

  // CNPJ completo -> dados da Receita (BrasilAPI), como o botão "Receita Federal" do Access.
  async function buscarCnpj(digitos: string) {
    setStatus({ texto: "Buscando dados do CNPJ...", tipo: "" });
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
      if (!r.ok) throw new Error(r.status === 404 ? "CNPJ não encontrado." : "Erro ao consultar CNPJ.");
      const d = await r.json();
      const fone = somenteDigitos(String(d.ddd_telefone_1 || ""));
      setDados((p) => ({
        ...p,
        nome: p.nome.trim() ? p.nome : String(d.razao_social || "").slice(0, 50),
        endereco: d.logradouro || p.endereco,
        numero: d.numero ? String(d.numero) : p.numero,
        complemento: d.complemento && !/^\*+$/.test(d.complemento) ? d.complemento : p.complemento,
        bairro: d.bairro || p.bairro,
        cep: d.cep ? mascararCep(String(d.cep)) : p.cep,
        email: p.email.trim() ? p.email : String(d.email || "").toLowerCase(),
        dddfone: fone.length >= 10 ? fone.slice(0, 2) : p.dddfone,
        numerofone: fone.length >= 10 ? fone.slice(2) : p.numerofone,
        codigotipolograd: d.descricao_tipo_de_logradouro ? acharTipoLogradouro(d.descricao_tipo_de_logradouro) || p.codigotipolograd : p.codigotipolograd,
      }));
      if (d.uf) await trocarEstado(d.uf, d.municipio);
      setStatus({ texto: `Dados de "${d.razao_social || ""}" preenchidos. Confira tudo antes de salvar.`, tipo: "ok" });
    } catch (e) {
      setStatus({ texto: e instanceof Error ? e.message : "Não foi possível buscar o CNPJ.", tipo: "erro" });
    }
  }

  function aoDigitarDoc(valor: string) {
    const mascarado = tipoDoc === "cpf" ? mascararCpf(valor) : mascararCnpj(valor);
    campo("inscrfederal", mascarado);
    const d = somenteDigitos(mascarado);
    if (tipoDoc === "cnpj" && d.length === 14 && d !== somenteDigitos(dados.inscrfederal)) buscarCnpj(d);
  }

  function aoDigitarCep(valor: string) {
    const mascarado = mascararCep(valor);
    campo("cep", mascarado);
    const d = somenteDigitos(mascarado);
    if (d.length === 8 && d !== somenteDigitos(dados.cep)) buscarCep(d);
  }

  function limpar() {
    setDados({ ...VAZIO });
    setMunicipios([]);
    setStatus({ texto: "", tipo: "" });
    setFaltando(new Set());
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);
    const falta = OBRIGATORIOS.filter((k) => !String(dados[k]).trim());
    const docDigitos = somenteDigitos(dados.inscrfederal);
    if (docDigitos.length !== (tipoDoc === "cpf" ? 11 : 14)) falta.push("inscrfederal");
    if (falta.length) {
      setFaltando(new Set(falta));
      setMensagem({ texto: "Favor preencher todos os campos: " + Array.from(new Set(falta)).map((k) => LABEL[k]).join(", "), tipo: "erro" });
      return;
    }
    setFaltando(new Set());
    if (!confirm("Confirma o cadastro no Financeiro?")) return;

    setEnviando(true);
    try {
      const r = await fetch("/api/paralegal/cadastro-avulso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoinscr: tipoDoc === "cpf" ? 1 : 2,
          nome: dados.nome.trim().slice(0, 50),
          inscrfederal: dados.inscrfederal,
          cep: somenteDigitos(dados.cep),
          codigotipolograd: Number(dados.codigotipolograd),
          endereco: dados.endereco.trim(),
          numero: dados.numero.trim(),
          complemento: dados.complemento.trim(),
          bairro: dados.bairro.trim(),
          siglaestado: dados.siglaestado,
          codigomunic: Number(dados.codigomunic),
          dddfone: Number(dados.dddfone),
          numerofone: Number(somenteDigitos(dados.numerofone)),
          email: dados.email.trim().toLowerCase(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMensagem({ texto: j.erro || j.error || `Erro ${r.status} ao cadastrar.`, tipo: "erro" });
        return;
      }
      const cod = j.codigocliente ?? j.codigopessoafin;
      setMensagem({ texto: `Pessoa cadastrada no Financeiro com sucesso${cod ? ` (código ${cod})` : ""}.`, tipo: "ok" });
      limpar();
    } catch {
      setMensagem({ texto: "Falha de rede ao cadastrar.", tipo: "erro" });
    } finally {
      setEnviando(false);
    }
  }

  const erro = (k: string) => (faltando.has(k) ? "pl-campo-erro" : undefined);

  return (
    <div className="pl-cadastro-empresa">
      <form onSubmit={salvar}>
        <div className="pl-card">
          <h2>Cadastro Avulso (Financeiro)</h2>
          <p style={{ fontSize: 12.5, opacity: 0.75, marginTop: -4 }}>Cadastra o cliente só no financeiro do Questor — não cria empresa.</p>
          <div className="pl-form-grid">
            <label className="full">Razão social / Nome
              <input type="text" maxLength={50} value={dados.nome} onChange={(e) => campo("nome", e.target.value)} className={erro("nome")} />
            </label>
            <div className="full" style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
              <span>Documento:</span>
              <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}><input type="radio" name="tipoDocAvulso" checked={tipoDoc === "cnpj"} onChange={() => { setTipoDoc("cnpj"); campo("inscrfederal", ""); }} style={{ width: "auto" }} /> CNPJ</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}><input type="radio" name="tipoDocAvulso" checked={tipoDoc === "cpf"} onChange={() => { setTipoDoc("cpf"); campo("inscrfederal", ""); }} style={{ width: "auto" }} /> CPF</label>
            </div>
            <label>{tipoDoc === "cpf" ? "CPF" : "CNPJ"}
              <input type="text" placeholder={tipoDoc === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} value={dados.inscrfederal} onChange={(e) => aoDigitarDoc(e.target.value)} className={erro("inscrfederal")} />
            </label>
            <label>CEP
              <input type="text" placeholder="00000-000" maxLength={9} value={dados.cep} onChange={(e) => aoDigitarCep(e.target.value)} className={erro("cep")} />
            </label>
            {status.texto && <span className={`full pl-cnpj-status${status.tipo ? " " + status.tipo : ""}`}>{status.texto}</span>}
          </div>
        </div>

        <div className="pl-card">
          <h2>Endereço</h2>
          <div className="pl-form-grid">
            <label>Tipo de logradouro
              <select value={dados.codigotipolograd} onChange={(e) => campo("codigotipolograd", e.target.value)} className={erro("codigotipolograd")}>
                <option value="">selecione</option>
                {logradouros.map((o) => <option key={String(o.codigo)} value={String(o.codigo)}>{o.descricao}</option>)}
              </select>
            </label>
            <label>Endereço
              <input type="text" value={dados.endereco} onChange={(e) => campo("endereco", e.target.value)} className={erro("endereco")} />
            </label>
            <label>Número
              <input type="text" value={dados.numero} onChange={(e) => campo("numero", e.target.value)} className={erro("numero")} />
            </label>
            <label>Complemento
              <input type="text" maxLength={20} value={dados.complemento} onChange={(e) => campo("complemento", e.target.value)} />
            </label>
            <label>Bairro
              <input type="text" maxLength={30} value={dados.bairro} onChange={(e) => campo("bairro", e.target.value)} className={erro("bairro")} />
            </label>
            <label>Estado
              <select value={dados.siglaestado} onChange={(e) => trocarEstado(e.target.value)} className={erro("siglaestado")}>
                <option value="">selecione</option>
                {estados.map((o) => <option key={String(o.codigo)} value={String(o.codigo)}>{String(o.codigo)}</option>)}
              </select>
            </label>
            <label>Cidade
              <select value={dados.codigomunic} onChange={(e) => campo("codigomunic", e.target.value)} className={erro("codigomunic")} disabled={!dados.siglaestado}>
                <option value="">{dados.siglaestado ? "selecione" : "selecione a UF primeiro"}</option>
                {municipios.map((o) => <option key={String(o.codigo)} value={String(o.codigo)}>{o.descricao}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="pl-card">
          <h2>Contato</h2>
          <div className="pl-form-grid">
            <label>DDD
              <input type="text" maxLength={2} inputMode="numeric" value={dados.dddfone} onChange={(e) => campo("dddfone", somenteDigitos(e.target.value).slice(0, 2))} className={erro("dddfone")} />
            </label>
            <label>Telefone
              <input type="text" maxLength={10} inputMode="numeric" value={dados.numerofone} onChange={(e) => campo("numerofone", somenteDigitos(e.target.value).slice(0, 9))} className={erro("numerofone")} />
            </label>
            <label className="full">E-mail
              <input type="email" value={dados.email} onChange={(e) => campo("email", e.target.value)} className={erro("email")} />
            </label>
          </div>
        </div>

        {mensagem && (
          <div className={`pl-banner${mensagem.tipo === "erro" ? " error" : ""}`} style={{ marginTop: 12 }}>{mensagem.texto}</div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" className="pl-btn" style={{ flex: 1 }} onClick={limpar} disabled={enviando}>Limpar</button>
          <button type="submit" className="pl-btn primary" style={{ flex: 2, padding: "12px 16px" }} disabled={enviando}>{enviando ? "Salvando…" : "Salvar no Financeiro"}</button>
        </div>
      </form>
    </div>
  );
}
