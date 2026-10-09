import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { chamar } from "@/lib/mei/api";

// Credenciais para o robô de NFS-e (Emissor Nacional; gov.br como reserva), como o emitirnota do Access.
// A senha é revelada pela API (fica registrado quem viu) e vai só para o robô local no PC de quem emite.
export const dynamic = "force-dynamic";

interface Cred { id: number; tipo: string; usuario: string | null; documento: string | null; ativo: boolean; tem_senha: boolean }

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "mei", "Sistema MEI")) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  const cod = Number(new URL(req.url).searchParams.get("cod"));
  if (!cod) return NextResponse.json({ error: "Informe o código do MEI." }, { status: 400 });

  const r = await chamar("GET", "/mei/credenciais", { query: { codigoempresa: cod, ativo: true, limit: 50 }, usuario: user?.email ?? null });
  if (r.status !== 200) return NextResponse.json({ error: `Não consegui ler as senhas (API ${r.status}).` }, { status: 502 });
  const lista = ((r.json as { dados?: Cred[] }).dados ?? []).filter((c) => c.ativo);
  const segredo = async (c: Cred) => {
    const s = await chamar("GET", `/mei/credenciais/${c.id}/segredo`, { usuario: user?.email ?? null });
    const d = s.json as { senha?: string; segredo?: string };
    return s.status === 200 ? (d.senha ?? d.segredo ?? "") : "";
  };
  const emi = lista.find((c) => c.tipo === "EMISSOR_NACIONAL" && c.usuario);
  if (emi) return NextResponse.json({ creds: { emissor: { usr: emi.usuario, senha: emi.tem_senha ? await segredo(emi) : "" } }, origem: "Emissor Nacional" });
  const gov = lista.find((c) => c.tipo === "GOVBR" && c.usuario);
  if (gov) return NextResponse.json({ creds: { govbr: { cpf: gov.usuario, senha: gov.tem_senha ? await segredo(gov) : "" } }, origem: "gov.br" });
  return NextResponse.json({ creds: null, origem: "sem senha cadastrada (login manual na janela do Chrome)" });
}
