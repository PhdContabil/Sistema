// "Já foi enviada ao Zen?" calculado AO VIVO — lógica PURA (só importa a
// classificação de envios, que também é pura), pra poder ser testada sem banco e
// importada pela tela.
//
// O resultado de uma simulação é um retrato do momento em que a varredura passou
// por cada empresa. Depois disso o envio em lote (ou a confirmação de uma empresa)
// manda documentos ao Zen e esse retrato continua dizendo "PRONTA" — quem olha a
// tabela não sabe o que já foi e o que falta. Aqui se cruza cada linha PRONTA com o
// registro permanente de envios (e com as reservas que sobraram de envios
// interrompidos) pra mostrar a situação de HOJE, sem mexer no retrato guardado.

import { classificarEnvios, type EnvioConhecido } from "./novidades-envio";

/** Tudo o que era elegível já foi cadastrado no Zen (por esta tela). Não entra mais em lote. */
export const MOTIVO_ENVIADA = "ENVIADA";

/** Parte dos documentos foi, parte falta. A empresa continua entrando em lote (só o que falta vai). */
export const MOTIVO_ENVIO_PARCIAL = "ENVIO PARCIAL (faltam documentos)";

/** Um envio ficou no meio sem certeza se o Zen gravou: alguém precisa conferir no Zen. */
export const MOTIVO_ENVIO_INTERROMPIDO = "ENVIO INTERROMPIDO (conferir no Zen)";

/** Uma reserva mais nova que isto é um envio ACONTECENDO agora, não um interrompido
 * (um passo do lote dura segundos; a função morre aos 60 s). */
export const RESERVA_EM_ANDAMENTO_MS = 3 * 60 * 1000;

export interface LinhaComSituacao {
  codigo: string;
  pronta: boolean;
  motivo: string;
  status: string;
  /** Nomes dos documentos elegíveis da empresa. */
  documentos: string[];
}

export interface ReservaConhecida {
  arquivo_nome: string;
  reservado_em: string;
}

function tempo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/aaaa hh:mm no horário de Brasília. */
export function dataHoraBr(iso: string): string {
  const n = tempo(iso);
  if (n === null) return iso;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(n));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/**
 * Situação de envio de UMA linha do resultado.
 *
 * Só mexe em linha PRONTA com documentos elegíveis (as demais já dizem por que não
 * estão prontas). Devolve uma cópia — o retrato guardado no banco não muda.
 *
 * - tudo já enviado ........ pronta=false, motivo ENVIADA
 * - envio interrompido ..... motivo ENVIO INTERROMPIDO (pronta só se ainda sobrar documento sem reserva)
 * - parte enviada .......... pronta=true, motivo ENVIO PARCIAL
 * - nada enviado ........... a linha como está
 *
 * `agora` é passado de fora pra a função continuar pura.
 */
export function aplicarSituacaoDeEnvio<L extends LinhaComSituacao>(
  linha: L,
  envios: EnvioConhecido[],
  reservas: ReservaConhecida[],
  agora: number
): L {
  if (!linha.pronta || linha.documentos.length === 0) return linha;

  const classificacao = classificarEnvios(
    linha.documentos.map((nome) => ({ nome })),
    envios
  );
  const novos = classificacao.novos.map((d) => d.nome);
  const jaEnviados = classificacao.jaEnviados.map((d) => d.nome);

  if (novos.length === 0) {
    const nomesEnviados = new Set(jaEnviados);
    let ultimo: number | null = null;
    for (const e of envios) {
      if (!nomesEnviados.has(e.arquivo_nome)) continue;
      const t = tempo(e.enviado_em);
      if (t !== null && (ultimo === null || t > ultimo)) ultimo = t;
    }
    const quando = ultimo !== null ? ` (último envio em ${dataHoraBr(new Date(ultimo).toISOString())})` : "";
    return {
      ...linha,
      pronta: false,
      motivo: MOTIVO_ENVIADA,
      status: `${MOTIVO_ENVIADA}: ${jaEnviados.length} documento(s) já cadastrado(s) no Zen${quando}`,
    };
  }

  // Reservas ANTIGAS = envio interrompido sem certeza. As recentes são envios
  // acontecendo agora (o lote está rodando) e não mudam a situação.
  const presos = new Set(
    reservas
      .filter((r) => {
        const t = tempo(r.reservado_em);
        return t !== null && agora - t > RESERVA_EM_ANDAMENTO_MS;
      })
      .map((r) => r.arquivo_nome)
  );
  const bloqueados = novos.filter((n) => presos.has(n));
  if (bloqueados.length > 0) {
    return {
      ...linha,
      pronta: bloqueados.length < novos.length,
      motivo: MOTIVO_ENVIO_INTERROMPIDO,
      status:
        `${MOTIVO_ENVIO_INTERROMPIDO}: ${bloqueados.join("; ")} — um envio parou no meio e não dá pra saber se o Zen ` +
        "gravou. Confira em CRM > Clientes > a empresa > Documentos antes de reenviar.",
    };
  }

  if (jaEnviados.length > 0) {
    return {
      ...linha,
      pronta: true,
      motivo: MOTIVO_ENVIO_PARCIAL,
      status:
        `${MOTIVO_ENVIO_PARCIAL}: ${jaEnviados.length} de ${linha.documentos.length} já enviado(s); ` +
        `falta(m): ${novos.join("; ")}`,
    };
  }

  return linha;
}

/** Agrupa linhas de uma tabela por `empresa_codigo` (pra cruzar com o resultado). */
export function agruparPorEmpresa<T extends { empresa_codigo: string }>(linhas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.empresa_codigo);
    if (lista) lista.push(l);
    else mapa.set(l.empresa_codigo, [l]);
  }
  return mapa;
}
