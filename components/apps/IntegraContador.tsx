"use client";

// Tecnologia · Integra Contador. Mostra só metadados (titular, CNPJ,
// validade); os segredos nunca voltam do servidor. Campos em branco não
// alteram o que está gravado. Layout padrão (PainelPadrao.module.css).

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { formatCNPJ } from "@/lib/conciliacao";
import s from "./PainelPadrao.module.css";

interface Meta {
  configurado: boolean;
  cert_titular: string | null;
  cert_cnpj: string | null;
  cert_validade: string | null;
  contratante_cnpj: string | null;
  tem_certificado: boolean;
  tem_consumer_key: boolean;
  tem_consumer_secret: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;
const dataBR = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const dias = (iso: string | null) => (iso ? Math.floor((Date.parse(iso) - Date.now()) / 86_400_000) : null);

function lerBase64(arquivo: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^;]*;base64,/, ""));
    r.onerror = () => erro(r.error);
    r.readAsDataURL(arquivo);
  });
}

export default function IntegraContador() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [contratante, setContratante] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/tecnologia/integra-contador", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j.error); return; }
    setMeta(j);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function testar() {
    setTestando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/tecnologia/integra-contador?testar=1", { cache: "no-store" });
      const j = await r.json();
      setMsg({ texto: j.mensagem ?? j.error, ok: !!j.ok });
    } finally {
      setTestando(false);
    }
  }

  async function salvar() {
    if (arquivo && !senha) { setMsg({ texto: "Informe a senha do certificado.", ok: false }); return; }
    if (!arquivo && !consumerKey && !consumerSecret && !contratante) { setMsg({ texto: "Nada para salvar: preencha ao menos um campo.", ok: false }); return; }
    setSalvando(true);
    setMsg(null);
    try {
      const corpo: Record<string, string> = {};
      if (arquivo) { corpo.pfxBase64 = await lerBase64(arquivo); corpo.pfxSenha = senha; }
      if (consumerKey) corpo.consumerKey = consumerKey;
      if (consumerSecret) corpo.consumerSecret = consumerSecret;
      if (contratante) corpo.contratanteCnpj = contratante;
      const r = await fetch("/api/tecnologia/integra-contador", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMeta(j.metadados);
      setArquivo(null); setSenha(""); setConsumerKey(""); setConsumerSecret(""); setContratante("");
      setMsg({ texto: "Configuração salva. Use “Testar conexão” para confirmar.", ok: true });
    } catch (e) {
      setMsg({ texto: e instanceof Error ? e.message : "Falha ao salvar.", ok: false });
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>;
  if (!meta) return <div className={s.painel}><div className={s.vazio} style={{ padding: 40 }}>Carregando…</div></div>;

  const restam = dias(meta.cert_validade);
  const corCert = restam == null ? "#64748b" : restam < 0 ? "#dc2626" : restam <= 60 ? "#d97706" : "#16a34a";

  return (
    <div className={s.wrap}>
      <div className={s.kpis} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className={s.kpi} style={{ ...tom(meta.configurado ? "#16a34a" : "#dc2626"), cursor: "default" }}>
          <div className={s.kpiRotulo}>Configuração</div>
          <div className={s.kpiValor} style={{ fontSize: 22 }}>{meta.configurado ? "Completa" : "Incompleta"}</div>
          <div className={s.kpiDesc}>certificado, chaves e CNPJ contratante</div>
        </div>
        <div className={s.kpi} style={{ ...tom(corCert), cursor: "default" }}>
          <div className={s.kpiRotulo}>Certificado A1</div>
          <div className={s.kpiValor} style={{ fontSize: 22 }}>{dataBR(meta.cert_validade)}</div>
          <div className={s.kpiDesc}>
            {restam == null ? "sem certificado" : restam < 0 ? `vencido há ${-restam} dias` : `vence em ${restam} dias`}
          </div>
        </div>
        <div className={s.kpi} style={{ ...tom("#475569"), cursor: "default" }}>
          <div className={s.kpiRotulo}>Última alteração</div>
          <div className={s.kpiValor} style={{ fontSize: 16 }}>{meta.updated_at ? new Date(meta.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</div>
          <div className={s.kpiDesc}>{meta.updated_by ?? "—"}</div>
        </div>
      </div>

      {msg && (
        <div className={`${s.aviso} ${msg.ok ? s.info : s.erro}`}>
          <span>{msg.texto}</span>
          <button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className={s.painel}>
        <div className={s.barra}>
          <strong>Em uso agora</strong>
          <span className={s.espaco} />
          <button className={s.botao} onClick={testar} disabled={testando || !meta.configurado}>
            {testando ? "Testando…" : "Testar conexão"}
          </button>
        </div>
        <div className={s.lateralCorpo}>
          <div className={s.grade2}>
            <div className={s.campo}><span className={s.campoRotulo}>Titular do certificado</span><span className={s.campoValor}>{meta.cert_titular ?? "—"}</span></div>
            <div className={s.campo}><span className={s.campoRotulo}>CNPJ do certificado</span><span className={s.campoValor}>{meta.cert_cnpj ? formatCNPJ(meta.cert_cnpj) : "—"}</span></div>
            <div className={s.campo}><span className={s.campoRotulo}>CNPJ contratante (escritório)</span><span className={s.campoValor}>{meta.contratante_cnpj ? formatCNPJ(meta.contratante_cnpj) : "—"}</span></div>
            <div className={s.campo}>
              <span className={s.campoRotulo}>Credenciais SERPRO</span>
              <span className={s.campoValor}>
                <span className={s.pill} style={tom(meta.tem_consumer_key ? "#16a34a" : "#dc2626")}><i />consumer key</span>{" "}
                <span className={s.pill} style={tom(meta.tem_consumer_secret ? "#16a34a" : "#dc2626")}><i />consumer secret</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={s.painel}>
        <div className={s.barra}><strong>Atualizar</strong><span className={s.dataSub}>campos em branco não mudam o que está gravado</span></div>
        <div className={s.lateralCorpo} style={{ maxWidth: 760 }}>
          <div className={s.grade2}>
            <label className={s.campo}>
              <span className={s.campoRotulo}>Novo certificado A1 (.pfx / .p12)</span>
              <input type="file" accept=".pfx,.p12" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <label className={s.campo}>
              <span className={s.campoRotulo}>Senha do certificado</span>
              <input type="password" className={s.select} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} disabled={!arquivo} />
            </label>
            <label className={s.campo}>
              <span className={s.campoRotulo}>Consumer key</span>
              <input className={s.select} autoComplete="off" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder={meta.tem_consumer_key ? "•••••• (gravada)" : ""} />
            </label>
            <label className={s.campo}>
              <span className={s.campoRotulo}>Consumer secret</span>
              <input type="password" className={s.select} autoComplete="new-password" value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} placeholder={meta.tem_consumer_secret ? "•••••• (gravado)" : ""} />
            </label>
            <label className={s.campo}>
              <span className={s.campoRotulo}>CNPJ contratante</span>
              <input className={s.select} value={contratante} onChange={(e) => setContratante(e.target.value)} placeholder="usa o do certificado se ficar em branco" />
            </label>
          </div>
          <div className={s.aviso}>
            O certificado é validado antes de gravar (senha, titular, CNPJ e validade); certificado vencido é recusado.
            A troca vale na hora para Situação Fiscal, Procurações e DCTFWeb, sem deploy.
          </div>
          <div><button className={`${s.botao} ${s.primario}`} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></div>
        </div>
      </div>
    </div>
  );
}
