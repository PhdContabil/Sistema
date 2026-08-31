"use client";

import { useEffect, useState } from "react";

/** Saudação por horário do dia — calculada no cliente ao montar (handoff: design_handoff_login_nucleo_contabil). */
export default function Saudacao() {
  const [texto, setTexto] = useState("Bem-vindo");

  useEffect(() => {
    const h = new Date().getHours();
    setTexto(
      h < 12
        ? "☀️ Bom dia! Que bom ter você por aqui"
        : h < 18
        ? "👋 Boa tarde! Vamos ao trabalho"
        : "🌙 Boa noite! Ainda por aqui?"
    );
  }, []);

  return (
    <div className="login-saudacao-wrap">
      <span className="login-saudacao">{texto}</span>
    </div>
  );
}
