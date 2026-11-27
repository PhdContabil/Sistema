"use client";

// Controles interativos da área Datas e Marcos (a página em si é de servidor).
import { useState } from "react";
import { useRouter } from "next/navigation";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

async function chamar(url: string, metodo: string, corpo: unknown): Promise<{ ok: boolean; dados: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, dados };
  } catch {
    return { ok: false, dados: { error: "Sem conexão. Tente de novo." } };
  }
}

/** Escolha de mês e ano: ← mês anterior, seletores, mês seguinte →, Hoje. */
export function SeletorMes({ ano, mes, aba, hojeAno, hojeMes }: { ano: number; mes: number; aba: string; hojeAno: number; hojeMes: number }) {
  const router = useRouter();
  const ir = (a: number, m: number) => router.push(`/m/pessoas/datas-marcos?aba=${aba}&ano=${a}&mes=${m}`);
  const ant = mes === 1 ? { a: ano - 1, m: 12 } : { a: ano, m: mes - 1 };
  const seg = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };
  const anos: number[] = [];
  for (let y = Math.min(hojeAno - 20, ano); y <= Math.max(hojeAno + 30, ano); y++) anos.push(y);
  return (
    <div className="toolbar dm-seletor">
      <button type="button" className="btn" onClick={() => ir(ant.a, ant.m)}>← {MESES[ant.m - 1].toLowerCase()}</button>
      <select className="sel" aria-label="Mês" value={mes} onChange={(e) => ir(ano, Number(e.target.value))}>
        {MESES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select className="sel" aria-label="Ano" value={ano} onChange={(e) => ir(Number(e.target.value), mes)}>
        {anos.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button type="button" className="btn" onClick={() => ir(seg.a, seg.m)}>{MESES[seg.m - 1].toLowerCase()} →</button>
      {(ano !== hojeAno || mes !== hojeMes) && (
        <button type="button" className="btn" onClick={() => ir(hojeAno, hojeMes)}>Hoje</button>
      )}
    </div>
  );
}

/** Liga ou desliga uma data (some da agenda, mas continua cadastrada). */
export function BotaoAtivarData({ id, ativo }: { id: number; ativo: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button" className="btn dm-mini" disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        const r = await chamar("/api/pessoas/datas-marcos/datas", "PATCH", { id, ativo: !ativo });
        setOcupado(false);
        if (!r.ok) { alert(String(r.dados.error ?? "Não consegui salvar.")); return; }
        router.refresh();
      }}
    >
      {ativo ? "Desativar" : "Reativar"}
    </button>
  );
}

/** Cadastro de uma data comemorativa ou campanha. */
export function FormNovaData() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [regra, setRegra] = useState("anual");
  const [mes, setMes] = useState("1");
  const [dia, setDia] = useState("1");
  const [data, setData] = useState("");
  const [tipo, setTipo] = useState("outro");
  const [cor, setCor] = useState("#2563eb");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  if (!aberto) return <button type="button" className="btn primary" onClick={() => setAberto(true)}>+ Nova data</button>;

  async function salvar() {
    setErro(""); setOcupado(true);
    const r = await chamar("/api/pessoas/datas-marcos/datas", "POST", {
      titulo, regra, tipo,
      mes: regra === "unica" ? null : Number(mes),
      dia: regra === "anual" ? Number(dia) : null,
      data_unica: regra === "unica" ? data : null,
      cor: regra === "mes" ? cor : null,
    });
    setOcupado(false);
    if (!r.ok) { setErro(String(r.dados.error ?? "Não consegui salvar.")); return; }
    setAberto(false); setTitulo(""); router.refresh();
  }

  return (
    <div className="dm-form">
      <div className="dm-form-grade">
        <label>Título<input className="sel" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Dia do Gerente" /></label>
        <label>Repete
          <select className="sel" value={regra} onChange={(e) => setRegra(e.target.value)}>
            <option value="anual">Todo ano, no mesmo dia</option>
            <option value="segundo_domingo">Todo ano, no 2º domingo do mês</option>
            <option value="mes">Campanha do mês inteiro</option>
            <option value="unica">Uma data só</option>
          </select>
        </label>
        {regra === "unica" ? (
          <label>Data<input className="sel" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        ) : (
          <label>Mês
            <select className="sel" value={mes} onChange={(e) => setMes(e.target.value)}>
              {MESES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
          </label>
        )}
        {regra === "anual" && <label>Dia<input className="sel" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} /></label>}
        {regra === "mes" && <label>Cor da campanha<input className="sel" type="color" value={cor} onChange={(e) => setCor(e.target.value)} /></label>}
        <label>Tipo na agenda
          <select className="sel" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="outro">Data comemorativa</option>
            <option value="confraternizacao">Confraternização</option>
            <option value="bem_estar">Bem-Estar</option>
            <option value="feriado">Feriado</option>
            <option value="emenda">Emenda</option>
          </select>
        </label>
      </div>
      {erro && <p className="dm-erro">{erro}</p>}
      <div className="dm-form-acoes">
        <button type="button" className="btn primary" disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="btn" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

/** Liga/desliga um lembrete e manda uma prévia para o e-mail de quem pediu. */
export function LembreteControle({ chave, ativo }: { chave: string; ativo: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  return (
    <div className="dm-lembrete-acoes">
      <button
        type="button" role="switch" aria-checked={ativo} aria-label={ativo ? "Desligar lembrete" : "Ligar lembrete"}
        className={`dm-toggle${ativo ? " on" : ""}`} disabled={ocupado}
        onClick={async () => {
          if (!ativo && !confirm("Ligar este lembrete? A partir da próxima rodada das 8h ele passa a ser enviado por e-mail.")) return;
          setOcupado(true);
          const r = await chamar("/api/pessoas/datas-marcos/lembretes", "PATCH", { chave, ativo: !ativo });
          setOcupado(false);
          if (!r.ok) { setAviso(String(r.dados.error ?? "Não consegui salvar.")); return; }
          router.refresh();
        }}
      />
      <button
        type="button" className="btn dm-mini" disabled={ocupado}
        onClick={async () => {
          setOcupado(true); setAviso("");
          const r = await chamar("/api/pessoas/datas-marcos/lembretes", "POST", { chave });
          setOcupado(false);
          setAviso(r.ok ? `Prévia enviada para ${String(r.dados.para)}.` : String(r.dados.error ?? "Não consegui enviar a prévia."));
        }}
      >
        Enviar prévia para mim
      </button>
      {aviso && <span className="dm-aviso">{aviso}</span>}
    </div>
  );
}

/** Puxa a admissão do Questor e mostra o resultado. */
export function BotaoSincronizarQuestor() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="dm-sync">
      <button
        type="button" className="btn" disabled={ocupado}
        onClick={async () => {
          setOcupado(true); setMsg("");
          const r = await chamar("/api/pessoas/datas-marcos/questor", "POST", {});
          setOcupado(false);
          if (!r.ok) { setMsg(String(r.dados.error ?? "Não consegui consultar o Questor.")); return; }
          const d = r.dados as { vinculados: number; atualizados: number; semVinculo: string[]; semCorrespondencia: string[] };
          setMsg(
            `${d.vinculados} vinculada(s) ao Questor, ${d.atualizados} admissão(ões) atualizada(s).` +
            (d.semVinculo.length ? ` Sem código do Questor no cadastro: ${d.semVinculo.length} pessoa(s).` : "") +
            (d.semCorrespondencia.length ? ` Código sem correspondência: ${d.semCorrespondencia.join(", ")}.` : "")
          );
          router.refresh();
        }}
      >
        {ocupado ? "Consultando o Questor…" : "Sincronizar admissão com o Questor"}
      </button>
      {msg && <p className="dm-aviso" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
