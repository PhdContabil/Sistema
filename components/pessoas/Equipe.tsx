"use client";

import { useEffect, useState } from "react";
import type { Perfil } from "@/lib/pessoas/dados";
import ListaPessoas from "./ListaPessoas";

export default function Equipe() {
  const [pessoas, setPessoas] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/pessoas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo) setPessoas(j.pessoas ?? []); })
      .catch(() => vivo && setErro("Não foi possível carregar a lista de pessoas."));
    return () => { vivo = false; };
  }, []);

  if (erro) return <div className="banner error">{erro}</div>;
  if (!pessoas) return <div className="loading">Carregando pessoas…</div>;
  if (pessoas.length === 0) {
    return <div className="banner">Nenhum perfil cadastrado ainda. Verifique a conexão com o banco.</div>;
  }

  return (
    <>
      <ListaPessoas pessoas={pessoas} />
      <p className="footnote">
        Clique em uma pessoa para ver o perfil completo. Cada um pode editar o próprio espaço após entrar com o e-mail da PHD.
        O perfil do Manoel (Júnior) está marcado como <strong>modelo</strong> — use como referência do que preencher.
      </p>
    </>
  );
}
