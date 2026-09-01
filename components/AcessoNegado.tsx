// Mensagem de acesso restrito por setor — substitui o conteúdo do módulo
// (nunca um alert()) quando a pessoa não tem permissão pra ver aquela área.
// Pedido do Pedro: "não um alert, mas sim uma mensagem, numa box, formatado,
// instrutivo, avisando que precisa contactar o T.I."

export default function AcessoNegado({
  moduloNome,
}: {
  moduloNome: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md, 12px)",
        padding: "28px 26px",
        maxWidth: 560,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 9999,
            background: "color-mix(in srgb, #e0483f 16%, transparent)",
            color: "#e0483f",
            flex: "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Acesso restrito</h2>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
        Seu usuário não tem permissão para acessar o módulo <strong>{moduloNome}</strong>.
        O acesso é liberado por setor — se você precisa trabalhar nessa área,
        entre em contato com o time de <strong>Tecnologia (T.I.)</strong> para
        que seu acesso seja revisado.
      </p>
    </div>
  );
}
