"use client";

import { useCallback, useEffect, useState } from "react";
import { TRANSPORTES } from "@/lib/pessoas/transporte";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";

interface Form {
  tratamento: string; cargo: string; historico: string; espaco_cultural: string; foto_url: string;
  transporte: string;
}
interface Formacao {
  id: number; curso: string; grau: string | null; instituicao: string | null;
  inicio: number | null; fim: number | null;
}
interface CursoEvento {
  id: number; tipo: string; titulo: string; instituicao: string | null;
  participacao: string | null; competencia: string | null;
}

const VAZIO: Form = {
  tratamento: "", cargo: "", historico: "", espaco_cultural: "", foto_url: "",
  transporte: "",
};


export default function EditarPerfil({ slug }: { slug: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [pessoaId, setPessoaId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [nome, setNome] = useState("");
  const [form, setForm] = useState<Form>(VAZIO);
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [cursos, setCursos] = useState<CursoEvento[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // formulários de novo item
  const [nf, setNf] = useState({ curso: "", grau: "", instituicao: "", inicio: "", fim: "" });
  const [nc, setNc] = useState({ tipo: "curso", titulo: "", instituicao: "", participacao: "", competencia: "" });

  const recarregarListas = useCallback(async (id: number) => {
    const sb = createSupabaseBrowserClient();
    const [{ data: f }, { data: c }] = await Promise.all([
      sb.from("pessoas_formacao").select("id,curso,grau,instituicao,inicio,fim").eq("pessoa_id", id).order("fim", { ascending: false }),
      sb.from("pessoas_cursos").select("id,tipo,titulo,instituicao,participacao,competencia").eq("pessoa_id", id).order("competencia", { ascending: false }),
    ]);
    setFormacoes((f ?? []) as Formacao[]);
    setCursos((c ?? []) as CursoEvento[]);
  }, []);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      const mail = user?.email?.toLowerCase() ?? null;
      setEmail(mail);

      const { data } = await sb.from("pessoas_perfil")
        .select("id,nome,email,tratamento,cargo,historico,espaco_cultural,foto_url,transporte")
        .eq("slug", slug).maybeSingle();

      if (data) {
        setPessoaId(data.id);
        setNome(data.nome ?? "");
        setForm({
          tratamento: data.tratamento ?? "", cargo: data.cargo ?? "",
          historico: data.historico ?? "", espaco_cultural: data.espaco_cultural ?? "",
          transporte: data.transporte ?? "",
          foto_url: data.foto_url ?? "",
        });
        setPermitido(Boolean(mail && data.email && String(data.email).toLowerCase() === mail));
        await recarregarListas(data.id);
      }
      setCarregando(false);
    })();
  }, [slug, recarregarListas]);

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 5 * 1024 * 1024) { setErro("A imagem deve ter até 5 MB."); return; }
    setEnviandoFoto(true); setErro(null); setMsg(null);
    const sb = createSupabaseBrowserClient();
    const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase();
    const caminho = `${slug}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("fotos-pessoas").upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
    if (upErr) { setEnviandoFoto(false); setErro(`Falha no upload: ${upErr.message}`); return; }
    const url = sb.storage.from("fotos-pessoas").getPublicUrl(caminho).data.publicUrl;
    const { error: updErr } = await sb.from("pessoas_perfil").update({ foto_url: url, atualizado_em: new Date().toISOString() }).eq("slug", slug);
    setEnviandoFoto(false);
    if (updErr) setErro(`Foto enviada, mas não salvou: ${updErr.message}`);
    else { setForm((f) => ({ ...f, foto_url: url })); setMsg("Foto atualizada."); }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg(null); setErro(null);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.from("pessoas_perfil").update({
      tratamento: form.tratamento || null, cargo: form.cargo || null,
      historico: form.historico || null, espaco_cultural: form.espaco_cultural || null,
      transporte: form.transporte || null,
      foto_url: form.foto_url || null, atualizado_em: new Date().toISOString(),
    }).eq("slug", slug);
    setSalvando(false);
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
    else setMsg("Perfil atualizado.");
  }

  async function addFormacao() {
    if (!pessoaId || !nf.curso.trim()) { setErro("Informe o nome do curso."); return; }
    setErro(null);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.from("pessoas_formacao").insert({
      pessoa_id: pessoaId, curso: nf.curso.trim(), grau: nf.grau || null,
      instituicao: nf.instituicao || null,
      inicio: nf.inicio ? Number(nf.inicio) : null, fim: nf.fim ? Number(nf.fim) : null,
    });
    if (error) { setErro(`Não foi possível adicionar: ${error.message}`); return; }
    setNf({ curso: "", grau: "", instituicao: "", inicio: "", fim: "" });
    await recarregarListas(pessoaId);
    setMsg("Formação adicionada.");
  }

  async function removerFormacao(id: number) {
    if (!pessoaId) return;
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.from("pessoas_formacao").delete().eq("id", id);
    if (error) setErro(`Não foi possível remover: ${error.message}`);
    else await recarregarListas(pessoaId);
  }

  async function addCurso() {
    if (!pessoaId || !nc.titulo.trim()) { setErro("Informe o título do curso/evento."); return; }
    setErro(null);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.from("pessoas_cursos").insert({
      pessoa_id: pessoaId, tipo: nc.tipo, titulo: nc.titulo.trim(),
      instituicao: nc.instituicao || null, participacao: nc.participacao || null,
      competencia: nc.competencia ? `${nc.competencia}-01` : null,
    });
    if (error) { setErro(`Não foi possível adicionar: ${error.message}`); return; }
    setNc({ tipo: "curso", titulo: "", instituicao: "", participacao: "", competencia: "" });
    await recarregarListas(pessoaId);
    setMsg("Item adicionado.");
  }

  async function removerCurso(id: number) {
    if (!pessoaId) return;
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.from("pessoas_cursos").delete().eq("id", id);
    if (error) setErro(`Não foi possível remover: ${error.message}`);
    else await recarregarListas(pessoaId);
  }

  if (carregando) return <div className="loading">Carregando…</div>;

  if (!email) {
    return (
      <div className="banner">
        <strong>Você precisa entrar para editar seu perfil.</strong>{" "}
        <Link href="/login">Entrar com o e-mail da PHD →</Link>
      </div>
    );
  }

  if (!permitido) {
    return (
      <div className="banner">
        <strong>Este perfil não está vinculado ao seu e-mail ({email}).</strong>
        <p style={{ margin: "6px 0 0" }}>
          Cada pessoa só edita o próprio espaço. Se este perfil é seu, peça ao time de Tecnologia para vincular seu e-mail.
        </p>
      </div>
    );
  }

  return (
    <div className="form-perfil">
      <div className="fp-nome">{nome}</div>
      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner error">{erro}</div>}

      <form onSubmit={salvar} className="form-perfil" style={{ gap: 16 }}>
        <div className="campo">
          <span>Foto do perfil</span>
          <div className="fp-foto">
            <span className="fp-preview">
              {form.foto_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={form.foto_url} alt="Sua foto" />
                : <span className="fp-sem">sem foto</span>}
            </span>
            <div className="fp-foto-acoes">
              <label className="btn" style={{ cursor: "pointer" }}>
                {enviandoFoto ? "Enviando…" : "Escolher imagem…"}
                <input type="file" accept="image/*" onChange={enviarFoto} disabled={enviandoFoto} style={{ display: "none" }} />
              </label>
              {form.foto_url && <button type="button" className="btn" onClick={() => setForm({ ...form, foto_url: "" })}>Remover</button>}
              <span className="fp-dica">JPG, PNG ou WEBP — até 5 MB.</span>
            </div>
          </div>
        </div>

        <label className="campo">
          <span>Como gosta de ser chamado</span>
          <input className="search" value={form.tratamento} onChange={(e) => setForm({ ...form, tratamento: e.target.value })} placeholder="Ex.: Manoel" />
        </label>

        <label className="campo">
          <span>Cargo</span>
          <input className="search" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex.: Encarregado de Tecnologia" />
        </label>

        <label className="campo">
          <span>Transporte</span>
          <select
            className="search"
            value={form.transporte}
            onChange={(e) => setForm({ ...form, transporte: e.target.value })}
          >
            <option value="">Não informado</option>
            {TRANSPORTES.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Seu histórico na PHD</span>
          <textarea rows={6} value={form.historico} onChange={(e) => setForm({ ...form, historico: e.target.value })} placeholder="Relate um pouco do seu histórico aqui na PHD." />
        </label>

        <label className="campo">
          <span>Espaço cultural e de relacionamento</span>
          <textarea rows={6} value={form.espaco_cultural} onChange={(e) => setForm({ ...form, espaco_cultural: e.target.value })} placeholder="Conte um pouco dos seus gostos, hobbies, curiosidades." />
        </label>

        <div className="fp-acoes">
          <button className="btn primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
          <Link className="btn" href="/m/pessoas/pessoas/equipe">Voltar</Link>
        </div>
      </form>

      {/* ===== Formação acadêmica ===== */}
      <section className="bloco-edit">
        <h3>Formação acadêmica</h3>
        {formacoes.length > 0 && (
          <table className="mini">
            <thead><tr><th>Curso</th><th>Grau</th><th>Período</th><th>Instituição</th><th></th></tr></thead>
            <tbody>
              {formacoes.map((f) => (
                <tr key={f.id}>
                  <td>{f.curso}</td>
                  <td className="mut">{f.grau ?? "–"}</td>
                  <td className="mut">{f.inicio ?? "?"}{f.fim ? `–${f.fim}` : "–atual"}</td>
                  <td className="mut">{f.instituicao ?? "–"}</td>
                  <td><button className="btn-remover" onClick={() => removerFormacao(f.id)} title="Remover">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="linha-add">
          <input className="search" placeholder="Curso *" value={nf.curso} onChange={(e) => setNf({ ...nf, curso: e.target.value })} />
          <input className="search" style={{ minWidth: 140 }} placeholder="Grau" value={nf.grau} onChange={(e) => setNf({ ...nf, grau: e.target.value })} />
          <input className="search" style={{ minWidth: 160 }} placeholder="Instituição" value={nf.instituicao} onChange={(e) => setNf({ ...nf, instituicao: e.target.value })} />
          <input className="search" style={{ minWidth: 80 }} placeholder="Início" value={nf.inicio} onChange={(e) => setNf({ ...nf, inicio: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          <input className="search" style={{ minWidth: 80 }} placeholder="Fim" value={nf.fim} onChange={(e) => setNf({ ...nf, fim: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          <button type="button" className="btn primary" onClick={addFormacao}>+ Adicionar</button>
        </div>
      </section>

      {/* ===== Cursos e eventos ===== */}
      <section className="bloco-edit">
        <h3>Cursos complementares e eventos</h3>
        {cursos.length > 0 && (
          <table className="mini">
            <thead><tr><th>Mês/ano</th><th>Título</th><th>Instituição</th><th>Participação</th><th></th></tr></thead>
            <tbody>
              {cursos.map((c) => (
                <tr key={c.id}>
                  <td className="mut">{c.competencia ? c.competencia.slice(0, 7).split("-").reverse().join("/") : "–"}</td>
                  <td>{c.titulo}</td>
                  <td className="mut">{c.instituicao ?? "–"}</td>
                  <td className="mut">{c.participacao ?? "–"}</td>
                  <td><button className="btn-remover" onClick={() => removerCurso(c.id)} title="Remover">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="linha-add">
          <select className="search" style={{ minWidth: 110 }} value={nc.tipo} onChange={(e) => setNc({ ...nc, tipo: e.target.value })}>
            <option value="curso">Curso</option>
            <option value="evento">Evento</option>
          </select>
          <input className="search" placeholder="Título *" value={nc.titulo} onChange={(e) => setNc({ ...nc, titulo: e.target.value })} />
          <input className="search" style={{ minWidth: 150 }} placeholder="Instituição/local" value={nc.instituicao} onChange={(e) => setNc({ ...nc, instituicao: e.target.value })} />
          <input className="search" style={{ minWidth: 150 }} placeholder="Participação" value={nc.participacao} onChange={(e) => setNc({ ...nc, participacao: e.target.value })} />
          <input className="search" style={{ minWidth: 130 }} type="month" value={nc.competencia} onChange={(e) => setNc({ ...nc, competencia: e.target.value })} />
          <button type="button" className="btn primary" onClick={addCurso}>+ Adicionar</button>
        </div>
      </section>
    </div>
  );
}
