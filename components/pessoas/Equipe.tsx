"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";
import type { Perfil } from "@/lib/pessoas/dados";
import ListaPessoas from "./ListaPessoas";

export default function Equipe() {
  const [pessoas, setPessoas] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data, error } = await sb
          .from("pessoas_perfil")
          .select("id,slug,nome,tratamento,cargo,setor,funcao,email,foto_url,historico,espaco_cultural,modelo,transporte")
          .eq("ativo", true)
          .order("nome");
        if (error) throw new Error(error.message);
        if (!vivo) return;
        const lista = ((data ?? []) as Perfil[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        setPessoas(lista);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar a lista de pessoas.");
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (erro) return <div className="banner error">{erro}</div>;
  if (!pessoas) return <div className="loading">Carregando pessoas…</div>;
  if (pessoas.length === 0) {
    return <div className="banner">Nenhum perfil cadastrado ainda.</div>;
  }

  return (
    <>
      <ListaPessoas pessoas={pessoas} />
      <p className="footnote">
        Clique em uma pessoa para ver o perfil completo. Cada um pode editar o próprio espaço.
        O perfil do Manoel (Júnior) está marcado como <strong>modelo</strong> — use como referência do que preencher.
      </p>
    </>
  );
}
