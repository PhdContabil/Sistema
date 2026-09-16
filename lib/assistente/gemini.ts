// Cliente simples pra API do Gemini (Google AI Studio, plano gratuito) —
// usado pelo assistente de chat do Núcleo. Sem SDK: só fetch, no mesmo
// estilo do resto do projeto (Graph, Teams). Precisa de GEMINI_API_KEY no
// ambiente (console: https://aistudio.google.com/apikey).
const MODELO = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

export interface ParteConteudo {
  text?: string;
  functionCall?: { name: string; id?: string; args: Record<string, unknown> };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
}

export interface ConteudoGemini {
  role: "user" | "model";
  parts: ParteConteudo[];
}

export interface DeclaracaoFuncao {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface RespostaGemini {
  texto: string | null;
  chamadaFuncao: { name: string; id?: string; args: Record<string, unknown> } | null;
  erro?: string;
}

export async function chamarGemini(params: {
  systemInstruction: string;
  contents: ConteudoGemini[];
  ferramentas?: DeclaracaoFuncao[];
}): Promise<RespostaGemini> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { texto: null, chamadaFuncao: null, erro: "GEMINI_API_KEY não configurada no servidor." };
  }

  const body: Record<string, unknown> = {
    contents: params.contents,
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
  };
  if (params.ferramentas?.length) {
    body.tools = [{ functionDeclarations: params.ferramentas }];
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { texto: null, chamadaFuncao: null, erro: `Gemini ${res.status}: ${txt.slice(0, 300)}` };
    }
    const json = await res.json();
    const parts: ParteConteudo[] = json?.candidates?.[0]?.content?.parts ?? [];
    const chamada = parts.find((p) => p.functionCall)?.functionCall ?? null;
    const texto = parts.map((p) => p.text).filter(Boolean).join("\n") || null;
    return { texto, chamadaFuncao: chamada };
  } catch (e) {
    return { texto: null, chamadaFuncao: null, erro: e instanceof Error ? e.message : "Falha ao chamar o Gemini." };
  }
}
