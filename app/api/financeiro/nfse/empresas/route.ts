import { NextResponse } from "next/server";
import { exigirFinanceiro } from "../_auth";
import { salvarConfig, salvarCertificado, removerCertificado, type EmpresaNfse } from "@/lib/nfse/empresas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Configuração da empresa emissora.
 *  - JSON { empresa, config: {...} }            -> salva os dados fiscais
 *  - JSON { empresa, removerCertificado: true } -> apaga o certificado
 *  - multipart (empresa, arquivo, senha)        -> envia o certificado A1
 * O .pfx e a senha só entram; nunca são devolvidos.
 */
export async function POST(req: Request) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await req.formData();
      const empresa = Number(f.get("empresa"));
      const arquivo = f.get("arquivo");
      const senha = String(f.get("senha") ?? "");
      if (!empresa || !(arquivo instanceof File) || !senha) return NextResponse.json({ error: "Informe a empresa, o arquivo .pfx e a senha." }, { status: 400 });
      const r = await salvarCertificado(empresa, Buffer.from(await arquivo.arrayBuffer()), senha, email);
      return NextResponse.json({ ok: true, ...r });
    }
    const b = (await req.json()) as { empresa?: number; config?: Partial<EmpresaNfse>; removerCertificado?: boolean };
    if (!b.empresa) return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    if (b.removerCertificado) { await removerCertificado(b.empresa, email); return NextResponse.json({ ok: true }); }
    await salvarConfig(b.empresa, b.config ?? {}, email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 400 });
  }
}
