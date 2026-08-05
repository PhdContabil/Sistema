import BotaoEntrar from "./BotaoEntrar";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; erro?: string; email?: string };
}) {
  const next = searchParams.next || "/";
  const erro = searchParams.erro;

  return (
    <div className="login-tela">
      <div className="login-card">
        <div className="login-marca">
          <span className="brand-mark">N</span>
          <span>
            <span className="login-nome">Núcleo Contábil</span>
            <span className="login-sub">Painel do escritório</span>
          </span>
        </div>

        <h1 className="login-titulo">Entrar no sistema</h1>
        <p className="login-lead">
          Use sua conta corporativa da PHD para acessar os módulos do escritório.
        </p>

        {erro === "dominio" && (
          <div className="banner error login-aviso">
            <strong>Acesso permitido apenas com e-mail da PHD.</strong>
            <p style={{ margin: "5px 0 0" }}>
              {searchParams.email ? `A conta ${searchParams.email} não pertence ao domínio ` : "Use um endereço "}
              <strong>@phdcontabil.com.br</strong>.
            </p>
          </div>
        )}
        {erro === "oauth" && (
          <div className="banner error login-aviso">
            Não foi possível concluir a entrada. Tente novamente.
          </div>
        )}
        {erro === "sessao" && (
          <div className="banner login-aviso">Sua sessão expirou. Entre novamente.</div>
        )}

        <BotaoEntrar next={next} />

        <p className="login-rodape">
          Problemas para entrar? Fale com o time de Tecnologia.
        </p>
      </div>
    </div>
  );
}
