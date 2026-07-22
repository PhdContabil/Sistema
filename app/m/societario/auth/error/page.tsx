import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: {
    reason?: string;
    email?: string;
    detail?: string;
  };
}) {
  const reason = searchParams.reason;
  const email = searchParams.email;
  const detail = searchParams.detail;

  let titulo = "Acesso negado";
  let msg: React.ReactNode = "Ocorreu um erro durante o login. Tente novamente.";

  if (reason === "not_allowed") {
    msg = (
      <>
        O email <strong>{email}</strong> não está autorizado a acessar este
        sistema. Entre em contato com o time de tecnologia para liberar.
      </>
    );
  } else if (reason === "not_admin") {
    titulo = "Área restrita";
    msg = (
      <>
        Essa área é exclusiva para administradores do sistema. Se você precisa
        de acesso, fale com o time de tecnologia.
      </>
    );
  } else if (reason === "exchange_failed") {
    titulo = "Falha ao validar sessão";
    msg = (
      <>
        Não foi possível concluir o login. Mensagem do servidor:
        <code className="block mt-2 bg-gray-100 rounded p-2 text-xs text-left">
          {detail || "(sem detalhe)"}
        </code>
      </>
    );
  } else if (reason === "oauth_error") {
    titulo = "Erro de autenticação";
    msg = (
      <>
        Microsoft/Supabase retornou um erro:
        <code className="block mt-2 bg-gray-100 rounded p-2 text-xs text-left">
          {detail || "(sem detalhe)"}
        </code>
      </>
    );
  } else if (reason === "no_code") {
    titulo = "Login interrompido";
    msg = "O processo de login foi interrompido. Tente novamente.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h1 className="text-xl font-bold mb-2">{titulo}</h1>
        <div className="text-sm text-gray-600 mb-4">{msg}</div>
        <Link
          href="/m/societario/login"
          className="inline-block bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded-lg px-5 py-2"
        >
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
