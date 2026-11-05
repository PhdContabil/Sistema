import { avisarLucro, type DadosAvisoLucro, type ResultadoAviso } from "./notificacao-teams";
import { registrarLogSharepoint } from "./log-sharepoint";

/**
 * Grava a linha na lista do SharePoint (dispara o fluxo do Power Automate, como no Access)
 * e, se TEAMS_WEBHOOK_LUCROS estiver definida, também posta direto no Teams.
 * Devolve "falhou" se qualquer canal ligado falhar; "desligada" se nenhum estiver ligado.
 */
export async function notificarLucro(d: DadosAvisoLucro, responsavel: string): Promise<ResultadoAviso> {
  const [sp, teams] = await Promise.all([registrarLogSharepoint(d, responsavel), avisarLucro(d)]);
  if (sp === "falhou" || teams === "falhou") return "falhou";
  return sp === "gravado" || teams === "enviada" ? "enviada" : "desligada";
}
