// Cliente pro modelo de IA autohospedado — roda num servidor da própria
// PHD com Ollama (https://ollama.com, grátis, sem conta), exposto pra
// internet via Cloudflare Tunnel. Nada aqui depende de conta ou API de
// uma empresa de IA: só chama o endereço configurado em OLLAMA_URL.
//
// Passo a passo de como montar esse servidor: docs/assistente-ia-setup.md
const MODELO_PADRAO = process.env.OLLAMA_MODEL || "llama3.1:8b";

export interface MensagemChat {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
}

export interface FerramentaDeclarada {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface ChamadaFuncao {
  name: string;
  arguments: Record<string, unknown>;
}

interface RespostaModelo {
  texto: string | null;
  chamadasFuncao: ChamadaFuncao[];
  erro?: string;
}

/** Timeout mais folgado que o normal — inferência num servidor próprio
 * (sem GPU dedicada, provavelmente) pode demorar bem mais que uma API paga. */
const TIMEOUT_MS = 45_000;

export async function chamarModelo(params: {
  mensagens: MensagemChat[];
  ferramentas?: FerramentaDeclarada[];
}): Promise<RespostaModelo> {
  const url = process.env.OLLAMA_URL;
  if (!url) {
    return { texto: null, chamadasFuncao: [], erro: "OLLAMA_URL não configurada no servidor (ver docs/assistente-ia-setup.md)." };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Se o túnel estiver protegido por Cloudflare Access (Service Auth),
  // essas duas variáveis autenticam a chamada sem precisar de login humano.
  if (process.env.CF_ACCESS_CLIENT_ID) headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
  if (process.env.CF_ACCESS_CLIENT_SECRET) headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;

  const controle = new AbortController();
  const corte = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODELO_PADRAO,
        messages: params.mensagens,
        tools: params.ferramentas,
        stream: false,
      }),
      cache: "no-store",
      signal: controle.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { texto: null, chamadasFuncao: [], erro: `Servidor de IA respondeu ${res.status}: ${txt.slice(0, 300)}` };
    }
    const json = await res.json();
    const msg = json?.message ?? {};
    const chamadas: ChamadaFuncao[] = (msg.tool_calls ?? []).map(
      (t: { function?: { name?: string; arguments?: Record<string, unknown> } }) => ({
        name: t.function?.name ?? "",
        arguments: t.function?.arguments ?? {},
      })
    );
    return { texto: msg.content || null, chamadasFuncao: chamadas };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return {
      texto: null,
      chamadasFuncao: [],
      erro: abortou
        ? "O servidor de IA demorou demais pra responder (timeout)."
        : e instanceof Error
        ? `Não consegui falar com o servidor de IA: ${e.message}`
        : "Não consegui falar com o servidor de IA.",
    };
  } finally {
    clearTimeout(corte);
  }
}
