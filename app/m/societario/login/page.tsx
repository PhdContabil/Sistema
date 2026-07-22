import Image from "next/image";
import { LoginButton } from "./LoginButton";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const nextPath = searchParams.next || "/m/societario";
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-5">
          <Image
            src="/phd-logo-login.png"
            alt="PhD Contábil"
            width={320}
            height={130}
            priority
            className="h-28 w-auto block mx-auto"
          />
        </div>

        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-brand-900 tracking-tight">
            Societário
          </div>
        </div>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-[10px] font-semibold text-gray-400 tracking-widest uppercase">
              Acesso seguro
            </span>
          </div>
        </div>

        <LoginButton nextPath={nextPath} />

        <p className="text-xs text-gray-500 text-center mt-4">
          Use sua conta corporativa{" "}
          <strong className="text-gray-700">@phdcontabil.com.br</strong>
        </p>

        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400">
            © {year} PhD Contábil · Sistema interno
          </p>
        </div>
      </div>
    </div>
  );
}
