// Ferramentas que o assistente de IA pode acionar pra consultar dados reais
// do Núcleo. Cada uma recebe o contexto de acesso de quem está perguntando
// e decide o que pode devolver — o modelo nunca acessa o banco direto.
//
// De propósito NÃO existe ferramenta de valores financeiros (honorários,
// ganho mensal, valor/hora) — mesma restrição do board de Tickets
// (ver souVejoMedicao em TicketsBoard.tsx / podeVerMedicao em lib/tickets.ts).
import { resumoPorSetor, ehSetor, SETOR_NOME, type SetorId } from "@/lib/tickets";
import { listarPessoas } from "@/lib/pessoas/dados";
import type { FerramentaDeclarada } from "./modelo";

export interface ContextoFerramenta {
  email: string;
  souAdminGeral: boolean;
  meuSetor: SetorId | null;
}

export const FERRAMENTAS: FerramentaDeclarada[] = [
  {
    type: "function",
    function: {
      name: "contar_tickets_abertos",
      description:
        "Conta quantos tickets estão em aberto (não finalizados) por setor. Quem não é administrador geral de Tickets só pode consultar o total do próprio setor — se pedir outro setor, a ferramenta recusa.",
      parameters: {
        type: "object",
        properties: {
          setor: {
            type: "string",
            description:
              "Setor a consultar (fiscal, trabalhista, financeiro, paralegal, contabil, mei, ti). Omitir pra usar o setor da própria pessoa, ou pra ver todos se ela for administradora geral.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_pessoa",
      description:
        "Busca pessoas do escritório pelo nome (ou parte do nome) e devolve setor, função/cargo e e-mail. Nunca devolve dado financeiro.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome ou parte do nome da pessoa procurada." },
        },
        required: ["nome"],
      },
    },
  },
];

function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  ctx: ContextoFerramenta
): Promise<Record<string, unknown>> {
  switch (nome) {
    case "contar_tickets_abertos": {
      const resumo = await resumoPorSetor().catch(() => ({}) as Record<string, number>);
      const setorPedido = typeof args.setor === "string" ? args.setor.toLowerCase() : undefined;

      if (setorPedido && ehSetor(setorPedido)) {
        if (!ctx.souAdminGeral && setorPedido !== ctx.meuSetor) {
          return { erro: "Essa pessoa só pode consultar o total do próprio setor." };
        }
        return { setor: SETOR_NOME[setorPedido] ?? setorPedido, abertos: resumo[setorPedido] ?? 0 };
      }

      if (!ctx.souAdminGeral) {
        if (!ctx.meuSetor) return { erro: "Essa pessoa não está vinculada a nenhum setor de Tickets." };
        return { setor: SETOR_NOME[ctx.meuSetor] ?? ctx.meuSetor, abertos: resumo[ctx.meuSetor] ?? 0 };
      }

      const porSetor = Object.fromEntries(
        Object.entries(resumo).map(([id, qtd]) => [SETOR_NOME[id] ?? id, qtd])
      );
      return { por_setor: porSetor };
    }

    case "buscar_pessoa": {
      const termo = typeof args.nome === "string" ? normaliza(args.nome) : "";
      if (!termo) return { erro: "Informe um nome pra buscar." };
      const pessoas = await listarPessoas().catch(() => []);
      const achadas = pessoas
        .filter((p) => normaliza(p.nome).includes(termo))
        .slice(0, 5)
        .map((p) => ({ nome: p.nome, setor: p.setor, funcao: p.funcao, cargo: p.cargo, email: p.email }));
      return achadas.length ? { pessoas: achadas } : { erro: "Ninguém encontrado com esse nome." };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
