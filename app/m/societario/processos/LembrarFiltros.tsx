"use client";
// Guarda os filtros da lista de processos no navegador: ao abrir um processo e voltar
// (ou entrar de novo pelo menu), a lista volta filtrada. Só some ao clicar em Limpar.
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CHAVE = "soc-processos-filtros";
const ler = () => { try { return localStorage.getItem(CHAVE) || ""; } catch { return ""; } };
const gravar = (v: string) => { try { if (v) localStorage.setItem(CHAVE, v); else localStorage.removeItem(CHAVE); } catch { /* sem storage */ } };

export function LembrarFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();

  useEffect(() => {
    if (sp.get("limpar")) { gravar(""); router.replace(pathname); return; }
    if (qs) { gravar(qs); return; }
    const salvo = ler();
    if (salvo) router.replace(`${pathname}?${salvo}`);
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
