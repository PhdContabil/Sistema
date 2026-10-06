// Varredura agendada do Robô Zen — "varrer de X em X tempo", sem ninguém com a
// tela aberta. Sugestão do time na apresentação do Robô Zen.
//
// Hoje a simulação só anda enquanto o navegador fica chamando /continuar (uma
// empresa por chamada). Aqui, um agendador (Vercel Cron, ver vercel.json)
// chama `executarTickVarredura` a cada minuto e este arquivo decide, a cada
// "tick", o que fazer:
//
//   - desligado (padrão)  -> não faz nada. Só liga se `ROBO_ZEN_VARREDURA_HORAS`
//                            (variável de ambiente ou linha em app_config) for > 0.
//   - tem simulação em andamento -> avança alguns passos dela (é o mesmo
//                            `avancarSimulacao` que a tela usa).
//   - não tem, e a última simulação começou há mais de X horas -> começa uma
//                            nova (mesmos passos do botão "Rodar simulação
//                            completa") e já avança.
//   - senão -> nada a fazer ainda.
//
// SOMENTE LEITURA, como a simulação manual: nunca envia nada ao Questor Zen e
// nunca mexe no SharePoint. O envio de verdade continua sendo um clique
// confirmado de uma pessoa (é irreversível).
//
// Tempo: cada passo (uma empresa) pode levar bem mais que alguns segundos, e a
// função da Vercel é morta aos 60s sem aviso (já aconteceu — ver PRs #5 a #9).
// Por isso um tick sempre faz o 1º passo e só encadeia outro se o tick ainda
// está bem no início (`MAX_MS_PARA_NOVO_PASSO`): o pior caso é um passo lento
// começando logo no início, nunca um passo lento começando perto do limite.

import { listarPastasTopo, obterContextoGraph } from "./empresas-sharepoint";
import { avancarSimulacao, type EstadoSimulacao } from "./job-simulacao";
import * as dbz from "./db";

/** Variável (ambiente ou app_config) com o intervalo, em horas, entre o INÍCIO
 * de uma varredura e o início da próxima. Ausente ou 0 = desligado. */
export const CONFIG_INTERVALO_HORAS = "ROBO_ZEN_VARREDURA_HORAS";

/** Só começa mais um passo no mesmo tick se o tick ainda não passou disto. */
export const MAX_MS_PARA_NOVO_PASSO = 5_000;

/** Teto de passos por tick, mesmo se todos forem rápidos. */
export const MAX_PASSOS_POR_TICK = 8;

export const CRIADO_POR_AGENDADOR = "agendador (varredura automática)";

export type AcaoTick = "desligado" | "aguardando_lote" | "nada_a_fazer" | "iniciou" | "avancou";

export interface ResultadoTick {
  acao: AcaoTick;
  simulacaoId?: string;
  passos?: number;
  estado?: EstadoSimulacao;
  /** Só em "nada_a_fazer": quando a próxima varredura pode começar (ISO). */
  proximaVarreduraApos?: string;
}

export interface DepsAgendador {
  agora: () => number;
  /** Intervalo configurado em horas (0 = desligado). */
  horasIntervalo: () => Promise<number>;
  simulacaoAtiva: () => Promise<dbz.SimulacaoRow | null>;
  loteEnvioAtivo: () => Promise<unknown | null>;
  ultimaSimulacao: () => Promise<dbz.SimulacaoRow | null>;
  iniciarSimulacao: () => Promise<dbz.SimulacaoRow>;
  avancar: (id: string) => Promise<EstadoSimulacao>;
}

/** Lê o intervalo; qualquer coisa que não seja um número finito > 0 é "desligado". */
export function interpretarHoras(valor: string | null): number {
  if (!valor) return 0;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function depsReais(): DepsAgendador {
  return {
    agora: () => Date.now(),
    horasIntervalo: async () => interpretarHoras(await dbz.lerConfig(CONFIG_INTERVALO_HORAS)),
    simulacaoAtiva: () => dbz.obterSimulacaoAtiva(),
    loteEnvioAtivo: () => dbz.obterLoteEnvioAtivo(),
    ultimaSimulacao: async () => (await dbz.listarSimulacoesRecentes(1))[0] ?? null,
    iniciarSimulacao: async () => {
      const ctx = await obterContextoGraph();
      const pastasTopo = await listarPastasTopo(ctx);
      return dbz.criarSimulacao(CRIADO_POR_AGENDADOR, pastasTopo);
    },
    avancar: avancarSimulacao,
  };
}

export async function executarTickVarredura(deps: DepsAgendador = depsReais()): Promise<ResultadoTick> {
  const horas = await deps.horasIntervalo();
  if (!(horas > 0)) return { acao: "desligado" };

  const inicio = deps.agora();
  let simulacao = await deps.simulacaoAtiva();
  let iniciou = false;

  if (!simulacao) {
    // Mesma regra do botão manual: não começa varredura com envio em lote rodando
    // (as duas mexem nas mesmas pastas).
    if (await deps.loteEnvioAtivo()) return { acao: "aguardando_lote" };

    // A idade conta desde o INÍCIO da última simulação (de qualquer origem e em
    // qualquer estado): se alguém rodou uma à mão agora há pouco, o agendador
    // espera; se ela foi parada ou deu erro, também espera o intervalo em vez de
    // ficar tentando de novo a cada minuto.
    const ultima = await deps.ultimaSimulacao();
    const intervaloMs = horas * 3_600_000;
    const liberadaEm = ultima ? Date.parse(ultima.criado_em) + intervaloMs : -Infinity;
    if (inicio < liberadaEm) {
      return { acao: "nada_a_fazer", proximaVarreduraApos: new Date(liberadaEm).toISOString() };
    }

    simulacao = await deps.iniciarSimulacao();
    iniciou = true;
  }

  let passos = 0;
  let estado: EstadoSimulacao;
  do {
    estado = await deps.avancar(simulacao.id);
    passos++;
  } while (!estado.concluida && passos < MAX_PASSOS_POR_TICK && deps.agora() - inicio < MAX_MS_PARA_NOVO_PASSO);

  return { acao: iniciou ? "iniciou" : "avancou", simulacaoId: simulacao.id, passos, estado };
}
