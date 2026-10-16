// Envio de UM documento ao Zen "à prova de duplicação" — lógica PURA (sem
// imports; tudo que toca banco, SharePoint ou Zen entra por `deps`), pra poder
// ser testada sem nada externo e usada igual pelo envio em lote e pela
// confirmação de uma empresa só.
//
// O problema: o Zen NÃO é idempotente — mandar o mesmo documento duas vezes cria
// dois documentos. E entre "o Zen gravou" e "o registro de envios anotou" existe
// uma janela (a rede cai, a função estoura o tempo, o banco pisca) em que o
// documento está no Zen mas o robô não sabe. Conferir o registro ANTES não cobre
// isso, nem cobre duas pessoas enviando ao mesmo tempo (as duas conferem, as duas
// veem "não enviado", as duas enviam).
//
// A solução é RESERVAR antes de enviar: uma linha atômica por (empresa, arquivo)
// — quem reserva primeiro envia, quem chega depois não envia. A reserva só é
// devolvida quando se tem CERTEZA de que o Zen não gravou nada; na dúvida ela
// fica, e o documento aparece como "envio interrompido — conferir no Zen" em vez
// de ser reenviado às cegas. Troca-se "talvez duplique" por "uma pessoa confere".

export interface DocumentoParaEnviar {
  id: string;
  nome: string;
}

export interface DepsEnvioSeguro {
  /** Reserva (empresa, arquivo) de forma ATÔMICA. "ja_reservado" = outro envio
   * (em andamento ou interrompido) já segura esse documento. Falha PROPAGA. */
  reservar(empresaCodigo: string, arquivoNome: string): Promise<"reservado" | "ja_reservado">;
  /** O documento já consta no registro permanente de envios? Conferido DE NOVO
   * depois de reservar: fecha a brecha de outro envio terminar (e devolver a
   * reserva) entre a conferência inicial e a reserva. Falha PROPAGA. */
  jaRegistrado(empresaCodigo: string, arquivoNome: string): Promise<boolean>;
  /** Devolve a reserva (só quando é certo que o Zen não gravou). */
  liberarReserva(empresaCodigo: string, arquivoNome: string): Promise<void>;
  /** Baixa os bytes do documento no SharePoint. */
  baixar(doc: DocumentoParaEnviar): Promise<Uint8Array>;
  /** Sobe o arquivo ao Zen (ainda NÃO cria documento). Devolve o CodigoArquivo. */
  subirArquivo(nome: string, bytes: Uint8Array): Promise<string>;
  /** Cria o documento no Zen. Devolve o id do documento. */
  importar(p: { codigoArquivo: string; titulo: string }): Promise<string>;
  /** Anota no registro permanente de envios. */
  registrar(p: { arquivoNome: string; documentoId: string }): Promise<void>;
  /** Espera entre tentativas de anotar o registro (injetável pra teste). */
  esperar?(ms: number): Promise<void>;
}

export type ResultadoEnvioDocumento =
  /** Está no Zen. `aviso` quando algo ficou pra conferir (ex.: não deu pra anotar o registro). */
  | { situacao: "enviado"; documentoId: string; aviso?: string }
  /** Não tentou: outro envio já segura esse documento. */
  | { situacao: "bloqueado"; mensagem: string }
  /** Não tentou: já constava no registro (outro envio terminou nesse meio tempo). */
  | { situacao: "ja_enviado" }
  /** Não foi enviado. `incerto` = o Zen PODE ter gravado (o documento fica bloqueado até alguém conferir). */
  | { situacao: "falhou"; mensagem: string; incerto: boolean };

/** Tentativas de anotar o registro depois que o Zen já gravou, e as esperas entre elas. */
export const ESPERAS_REGISTRO_MS = [300, 1500];

function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "erro sem mensagem";
  return String(e ?? "erro sem mensagem");
}

function statusDe(e: unknown): number {
  if (typeof e === "object" && e !== null && "status" in e) return Number((e as { status: unknown }).status);
  return NaN;
}

/** O Zen RECUSOU o pedido (HTTP 4xx, menos 408) — então não gravou nada. 5xx, queda
 * de conexão e tempo esgotado NÃO entram: o pedido pode ter chegado e gravado. */
export function zenRecusouDeCerteza(e: unknown): boolean {
  const s = statusDe(e);
  return Number.isFinite(s) && s >= 400 && s <= 499 && s !== 408;
}

const esperaPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const TEXTO_CONFERIR_NO_ZEN =
  "confira no Zen (CRM > Clientes > a empresa > Documentos) antes de reenviar — o documento fica bloqueado até alguém conferir";

export async function enviarDocumentoSeguro(
  deps: DepsEnvioSeguro,
  empresaCodigo: string,
  doc: DocumentoParaEnviar
): Promise<ResultadoEnvioDocumento> {
  // 1) Reserva. Sem reserva não se envia — nunca.
  let reserva: "reservado" | "ja_reservado";
  try {
    reserva = await deps.reservar(empresaCodigo, doc.nome);
  } catch (e) {
    return {
      situacao: "falhou",
      incerto: false,
      mensagem: `não consegui reservar o documento (${mensagemDe(e)}) — por segurança nada foi enviado`,
    };
  }
  if (reserva === "ja_reservado") {
    return {
      situacao: "bloqueado",
      mensagem: `já existe um envio em andamento ou interrompido deste documento — ${TEXTO_CONFERIR_NO_ZEN}`,
    };
  }

  const liberar = async () => {
    try {
      await deps.liberarReserva(empresaCodigo, doc.nome);
    } catch {
      // Na pior das hipóteses a reserva fica e o documento aparece como "conferir".
    }
  };

  // 1b) Reservou — conferir o registro de novo. Se outro envio terminou entre a
  // conferência de quem chamou e a reserva, o documento já está no Zen.
  try {
    if (await deps.jaRegistrado(empresaCodigo, doc.nome)) {
      await liberar();
      return { situacao: "ja_enviado" };
    }
  } catch (e) {
    await liberar();
    return {
      situacao: "falhou",
      incerto: false,
      mensagem: `não consegui conferir o registro de envios (${mensagemDe(e)}) — por segurança nada foi enviado`,
    };
  }

  // 2) Baixar e subir: o Zen ainda não criou documento nenhum — falha aqui é certa.
  let codigoArquivo: string;
  try {
    const bytes = await deps.baixar(doc);
    codigoArquivo = await deps.subirArquivo(doc.nome, bytes);
  } catch (e) {
    await liberar();
    return { situacao: "falhou", incerto: false, mensagem: mensagemDe(e) };
  }

  // 3) Criar o documento no Zen — é aqui que o "talvez gravou" mora.
  const titulo = doc.nome.replace(/\.[^./\\]+$/, "");
  let documentoId: string;
  try {
    documentoId = await deps.importar({ codigoArquivo, titulo });
  } catch (e) {
    if (zenRecusouDeCerteza(e)) {
      await liberar();
      return { situacao: "falhou", incerto: false, mensagem: mensagemDe(e) };
    }
    return {
      situacao: "falhou",
      incerto: true,
      mensagem: `${mensagemDe(e)} — o Zen pode ter gravado: ${TEXTO_CONFERIR_NO_ZEN}`,
    };
  }

  // 4) O Zen gravou. Anotar o registro (algumas tentativas — o banco pode piscar).
  const esperar = deps.esperar ?? esperaPadrao;
  let ultimoErro: unknown = null;
  for (let tentativa = 0; tentativa <= ESPERAS_REGISTRO_MS.length; tentativa++) {
    try {
      await deps.registrar({ arquivoNome: doc.nome, documentoId });
      await liberar();
      return { situacao: "enviado", documentoId };
    } catch (e) {
      ultimoErro = e;
      if (tentativa < ESPERAS_REGISTRO_MS.length) await esperar(ESPERAS_REGISTRO_MS[tentativa]);
    }
  }
  // Gravou no Zen e não anotou: a reserva FICA (impede reenviar) e a pessoa é avisada.
  return {
    situacao: "enviado",
    documentoId,
    aviso:
      `o Zen gravou (documento ${documentoId}), mas não consegui anotar no registro de envios (${mensagemDe(ultimoErro)}) — ` +
      "NÃO envie este documento de novo; avise o suporte para anotar no registro",
  };
}
