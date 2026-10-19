import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import {
  getLookupCadastroEmpresa,
  getLookupMunicipios,
  buscarCnaes,
  getServicosEscritorio,
  getAtividadesMunicipais,
  QuestorError,
  type TipoLookupCadastro,
} from "@/lib/questor";
import ativmunic from "@/lib/mei/ativmunic.json";

// Listas fixas + buscas (naturezas jurídicas, enquadramentos, tabela de
// feriado, tipo de logradouro, estados, municípios, CNAEs) do formulário de
// Cadastro de Empresa — migrado de /api/questor/lookups/* do Paralegal System.
export const dynamic = "force-dynamic";

const TIPOS_FIXOS: TipoLookupCadastro[] = ["naturezas-juridicas", "enquadramentos", "tabelas-feriado", "tipos-logradouro", "estados"];

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle") && !podeAcessarApp(nivel, "mei", "Sistema MEI")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") ?? "";

  try {
    if (tipo === "municipios") {
      const uf = searchParams.get("uf") ?? "";
      if (!uf) return NextResponse.json({ error: "Parâmetro uf é obrigatório." }, { status: 400 });
      const dados = await getLookupMunicipios(uf);
      return NextResponse.json({ dados });
    }
    if (tipo === "ativ-municipais") {
      // Atividades municipais (tabela ATIVMUNIC do Questor) do município — é o que o cadastro valida.
      // A rota /lookups/servicos-municipais da API lê outra tabela (servicomunicipal, códigos "17.19"),
      // por isso usamos uma cópia da ATIVMUNIC (lib/mei/ativmunic.json) até a API ter a lista certa.
      const uf = searchParams.get("uf") ?? ""; const codigomunic = searchParams.get("codigomunic") ?? "";
      // Agora vem da API (/lookups/atividades-municipais, lê a ATIVMUNIC). A cópia fixa fica só de reserva se a API falhar.
      try {
        const daApi = await getAtividadesMunicipais(uf, codigomunic);
        if (daApi.length) return NextResponse.json({ dados: daApi });
      } catch { /* cai na cópia fixa */ }
      const tabela = ativmunic as Record<string, { codigo: string; descricao: string }[] | { codigo: string; descricao: string }>;
      const v = tabela[`${uf}-${Number(codigomunic)}`];
      return NextResponse.json({ dados: v ? (Array.isArray(v) ? v : [v]) : [] });
    }
    if (tipo === "servicos-paralegal") {
      // Serviços do Paralegal no Questor (SERVICOESCRIT com codigocaixaplano 2709).
      return NextResponse.json({ dados: await getServicosEscritorio(2709) });
    }
    if (tipo === "cnaes") {
      const q = searchParams.get("q") ?? "";
      if (!q) return NextResponse.json({ dados: [] });
      const dados = await buscarCnaes(q);
      return NextResponse.json({ dados });
    }
    if ((TIPOS_FIXOS as string[]).includes(tipo)) {
      const dados = await getLookupCadastroEmpresa(tipo as TipoLookupCadastro);
      return NextResponse.json({ dados });
    }
    return NextResponse.json({ error: `Tipo de lookup desconhecido: ${tipo}` }, { status: 400 });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Questor." }, { status });
  }
}
