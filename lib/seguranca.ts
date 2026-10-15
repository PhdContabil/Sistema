// Utilitários de segurança usados pelas rotas de API.
import { timingSafeEqual } from "crypto";

/** Confere "Authorization: Bearer <token>" em tempo constante. */
export function bearerConfere(req: Request, ...tokens: (string | undefined)[]): boolean {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const enviado = Buffer.from(auth.slice(7));
  return tokens.some((t) => {
    if (!t) return false;
    const esperado = Buffer.from(t);
    return esperado.length === enviado.length && timingSafeEqual(esperado, enviado);
  });
}

// Limite simples de requisições por chave (memória da instância; é um freio, não uma garantia).
const janelas = new Map<string, { inicio: number; n: number }>();
/** true = pode seguir; false = passou do limite na janela. */
export function dentroDoLimite(chave: string, max: number, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || agora - j.inicio > janelaMs) {
    janelas.set(chave, { inicio: agora, n: 1 });
    if (janelas.size > 5000) janelas.clear();
    return true;
  }
  j.n += 1;
  return j.n <= max;
}