"use client";

import { useEffect, useRef, useState } from "react";
import { useUsuario } from "./UsuarioAtual";

interface Mensagem {
  role: "user" | "model";
  texto: string;
  erro?: boolean;
}

const SAUDACAO: Mensagem = {
  role: "model",
  texto: "Oi! Posso ajudar com dúvidas sobre o Núcleo, contabilidade/fiscal/trabalhista em geral, ou consultar alguns dados do sistema. O que você precisa?",
};

export default function AssistenteChat() {
  const usuario = useUsuario();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([SAUDACAO]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, aberto]);

  // Só aparece pra quem está logado — não faz sentido no ecrã de login.
  if (!usuario) return null;

  async function enviar() {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;
    const historico = [...mensagens, { role: "user" as const, texto: pergunta }];
    setMensagens(historico);
    setTexto("");
    setEnviando(true);
    try {
      const resp = await fetch("/api/assistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagens: historico
            .filter((m) => m !== SAUDACAO)
            .map((m) => ({ role: m.role, texto: m.texto })),
        }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setMensagens((m) => [...m, { role: "model", texto: j.error || "Deu erro por aqui, tenta de novo.", erro: true }]);
      } else {
        setMensagens((m) => [...m, { role: "model", texto: j.resposta }]);
      }
    } catch {
      setMensagens((m) => [...m, { role: "model", texto: "Não consegui falar com o servidor agora.", erro: true }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="assistente-wrap">
      {aberto && (
        <div className="assistente-painel">
          <div className="assistente-cab">
            <span className="assistente-cab-txt">Assistente do Núcleo</span>
            <button className="assistente-fechar" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
          </div>
          <div className="assistente-lista">
            {mensagens.map((m, i) => (
              <div key={i} className={`assistente-msg ${m.role === "user" ? "eu" : "ia"} ${m.erro ? "erro" : ""}`}>
                {m.texto}
              </div>
            ))}
            {enviando && <div className="assistente-msg ia assistente-digitando"><span /><span /><span /></div>}
            <div ref={fimRef} />
          </div>
          <div className="assistente-input-linha">
            <textarea
              className="assistente-input"
              placeholder="Pergunte alguma coisa…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
            />
            <button className="assistente-enviar" onClick={enviar} disabled={enviando || !texto.trim()} aria-label="Enviar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        className="assistente-bolha"
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
        title="Assistente do Núcleo"
      >
        {aberto ? (
          "✕"
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
