import BotaoEntrar from "./BotaoEntrar";
import Saudacao from "./Saudacao";

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
      {/* Painel institucional — handoff: design_handoff_login_nucleo_contabil */}
      <div className="login-painel">
        <div className="login-marca-topo">Núcleo Contábil</div>

        <div className="login-meio">
          <h1 className="login-titulo-grande">Toda a inteligência contábil da PHD, em um único lugar.</h1>
          <div className="login-divisor" />
          <p className="login-desc">
            O Núcleo Contábil reúne fiscal, financeiro, pessoas e societário do escritório em um único acesso.
          </p>
        </div>

        <div className="login-tags">
          <span className="login-tag">Precisão</span>
          <span className="login-tag">Transparência</span>
          <span className="login-tag">Pessoas</span>
        </div>
      </div>

      <div className="login-lado-claro">
        <div className="login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/phd-logo.png" alt="PHD Contábil" className="login-logo" />

          <Saudacao />

          <h2 className="login-titulo">Entrar no sistema</h2>
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
    </div>
  );
}
