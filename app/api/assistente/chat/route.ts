import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { SETOR_NOME } from "@/lib/tickets";
import { MODULES } from "@/lib/modules";
import { chamarModelo, type MensagemChat } from "@/lib/assistente/modelo";
import { FERRAMENTAS, executarFerramenta } from "@/lib/assistente/ferramentas";

// Assistente flutuante do Núcleo — ajuda com (1) como usar o próprio
// sistema, (2) dúvidas gerais de contabilidade/fiscal/trabalhista e (3)
// alguns dados reais, só através das ferramentas em lib/assistente/ferramentas.ts.
//
// Roda num modelo autohospedado (Ollama) num servidor da PHD, não numa API
// paga/externa — ver docs/assistente-ia-setup.md pra como montar isso e
// quais variáveis de ambiente (OLLAMA_URL etc.) precisam existir.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // inferência num servidor próprio pode demorar mais que uma API paga

function construirSystemPrompt(nome: string, email: string, setorNome: string | null): string {
  const modulos = MODULES.map((m) => {
    const apps = m.apps
      .map((a) => (a.href ? `${a.name} (${a.href}) — ${a.desc}` : `${a.name} — ainda não implementado, "em breve"`))
      .join("; ");
    return `- ${m.name}: ${m.desc}\n  Apps: ${apps}`;
  }).join("\n");

  return `Você é o assistente do Núcleo Contábil, o sistema interno da PHD Contabilidade. Responda sempre em português do Brasil, de forma direta, educada e sem enrolação. Não use markdown pesado (nada de tabelas ou títulos) — é um chat, escreva em frases curtas ou listas simples quando precisar.

Você ajuda com três tipos de coisa:

1) Como usar o próprio Núcleo Contábil. Os módulos e aplicações existentes são:
${modulos}
Se perguntarem sobre um app sem endereço, diga que ainda não foi implementado.

2) Dúvidas gerais de contabilidade, fiscal, trabalhista, societário e correlatos — responda com seu próprio conhecimento. Deixe claro quando a resposta pode variar por legislação, convenção coletiva ou política interna, e recomende confirmar com quem é responsável por aquilo no escritório antes de agir.

3) Alguns dados reais do sistema, só através das ferramentas disponíveis (contar tickets abertos por setor, buscar uma pessoa do escritório). Nunca invente números ou informações — se não tiver uma ferramenta pra aquilo, diga que não tem acesso a esse dado agora.

Nunca revele nem estime valores financeiros do escritório (honorários, ganho mensal, valor da hora) — de propósito você não tem ferramenta pra isso, é informação restrita a T.I./Diretoria.

A pessoa falando com você agora é ${nome} (${email})${setorNome ? `, do setor ${setorNome}` : ""}.`;
}

interface MensagemEntrada {
  role: "user" | "model";
  texto: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { mensagens?: MensagemEntrada[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const entrada = body.mensagens ?? [];
  if (!entrada.length) return NextResponse.json({ error: "Sem mensagens." }, { status: 400 });

  const nivel = await obterNivelAcesso(user.email);
  const nome =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email.split("@")[0];
  const setorNome = nivel.setor ? (SETOR_NOME[nivel.setor] ?? nivel.setor) : null;

  const systemPrompt = construirSystemPrompt(nome, user.email, setorNome);
  const mensagens: MensagemChat[] = [
    { role: "system", content: systemPrompt },
    ...entrada.map((m) => ({ role: (m.role === "model" ? "assistant" : "user") as "assistant" | "user", content: m.texto })),
  ];

  let rodada = await chamarModelo({ mensagens, ferramentas: FERRAMENTAS });
  if (rodada.erro) return NextResponse.json({ error: rodada.erro }, { status: 502 });

  // Até 3 idas-e-voltas de function calling, pra não travar se o modelo insistir.
  let voltas = 0;
  while (rodada.chamadasFuncao.length && voltas < 3) {
    mensagens.push({ role: "assistant", content: rodada.texto ?? "" });
    for (const chamada of rodada.chamadasFuncao) {
      const resultado = await executarFerramenta(chamada.name, chamada.arguments, {
        email: user.email,
        souAdminGeral: nivel.acessoTotal,
        meuSetor: nivel.setor,
      });
      mensagens.push({ role: "tool", tool_name: chamada.name, content: JSON.stringify(resultado) });
    }
    rodada = await chamarModelo({ mensagens, ferramentas: FERRAMENTAS });
    if (rodada.erro) return NextResponse.json({ error: rodada.erro }, { status: 502 });
    voltas++;
  }

  return NextResponse.json({ resposta: rodada.texto ?? "Não consegui gerar uma resposta agora." });
}
