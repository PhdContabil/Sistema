"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";

interface Form {
  tratamento: string;
  cargo: string;
  historico: string;
  espaco_cultural: string;
  foto_url: string;
}

export default function EditarPerfil({ slug }: { slug: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [nome, setNome] = useState("");
  const [form, setForm] = useState<Form>({ tratamento: "", cargo: "", historico: "", espaco_cultural: "", foto_url: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 5 * 1024 * 1024) { setErro("A imagem deve ter até 5 MB."); return; }

    setEnviandoFoto(true); setErro(null); setMsg(null);
    const sb = createSupabaseBrowserClient();
    const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase();
    const caminho = `${slug}-${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage.from("fotos-pessoas").upload(caminho, arquivo, {
      upsert: true, contentType: arquivo.type,
    });
    if (upErr) { setEnviandoFoto(false); setErro(`Falha no upload: ${upErr.message}`); return; }

    const { data } = sb.storage.from("fotos-pessoas").getPublicUrl(caminho);
    const url = data.publicUrl;

    const { error: updErr } = await sb.from("pessoas_perfil")
      .update({ foto_url: url, atualizado_em: new Date().toISOString() }).eq("slug", slug);
    setEnviandoFoto(false);
    if (updErr) setErro(`Foto enviada, mas não salvou no perfil: ${updErr.message}`);
    else { setForm((f) => ({ ...f, foto_url: url })); setMsg("Foto atualizada."); }
  }

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      const mail = user?.email?.toLowerCase() ?? null;
      setEmail(mail);

      const { data } = await sb
        .from("pessoas_perfil")
        .select("nome,email,tratamento,cargo,historico,espaco_cultural,foto_url")
        .eq("slug", slug)
        .maybeSingle();

      if (data) {
        setNome(data.nome ?? "");
        setForm({
          tratamento: data.tratamento ?? "",
          cargo: data.cargo ?? "",
          historico: data.historico ?? "",
          espaco_cultural: data.espaco_cultural ?? "",
          foto_url: data.foto_url ?? "",
        });
        setPermitido(Boolean(mail && data.email && String(data.email).toLowerCase() === mail));
      }
      setCarregando(false);
    })();
  }, [slug]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg(null); setErro(null);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb
      .from("pessoas_perfil")
      .update({
        tratamento: form.tratamento || null,
        cargo: form.cargo || null,
        historico: form.historico || null,
        espaco_cultural: form.espaco_cultural || null,
        foto_url: form.foto_url || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("slug", slug);
    setSalvando(false);
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
    else setMsg("Perfil atualizado.");
  }

  if (carregando) return <div className="loading">Carregando…</div>;

  if (!email) {
    return (
      <div className="banner">
        <strong>Você precisa entrar para editar seu perfil.</strong>{" "}
        <Link href="/m/societario/login">Entrar com o e-mail da PHD →</Link>
      </div>
    );
  }

  if (!permitido) {
    return (
      <div className="banner">
        <strong>Este perfil não está vinculado ao seu e-mail ({email}).</strong>
        <p style={{ margin: "6px 0 0" }}>
          Cada pessoa só pode editar o próprio espaço. Se este perfil é seu, peça ao time de Tecnologia
          para vincular seu e-mail ao cadastro.
        </p>
      </div>
    );
  }

  return (
    <form className="form-perfil" onSubmit={salvar}>
      <div className="fp-nome">{nome}</div>

      <label className="campo">
        <span>Como gosta de ser chamado</span>
        <input className="search" value={form.tratamento} onChange={(e) => setForm({ ...form, tratamento: e.target.value })} placeholder="Ex.: Manoel" />
      </label>

      <label className="campo">
        <span>Cargo</span>
        <input className="search" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex.: Sócio - Gestor de Pessoas e Finanças" />
      </label>

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
            {form.foto_url && (
              <button type="button" className="btn" onClick={() => setForm({ ...form, foto_url: "" })}>Remover</button>
            )}
            <span className="fp-dica">JPG, PNG ou WEBP — até 5 MB.</span>
          </div>
        </div>
      </div>

      <label className="campo">
        <span>Seu histórico na PHD</span>
        <textarea rows={6} value={form.historico} onChange={(e) => setForm({ ...form, historico: e.target.value })} placeholder="Relate um pouco do seu histórico aqui na PHD." />
      </label>

      <label className="campo">
        <span>Espaço cultural e de relacionamento</span>
        <textarea rows={6} value={form.espaco_cultural} onChange={(e) => setForm({ ...form, espaco_cultural: e.target.value })} placeholder="Conte um pouco dos seus gostos, hobbies, curiosidades." />
      </label>

      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner error">{erro}</div>}

      <div className="fp-acoes">
        <button className="btn primary" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
        <Link className="btn" href="/m/pessoas/pessoas/equipe">Voltar</Link>
      </div>

      <p className="footnote">Formação acadêmica, cursos e eventos entram na próxima etapa (com botões de adicionar item).</p>
    </form>
  );
}
