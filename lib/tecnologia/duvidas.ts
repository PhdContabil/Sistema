// Dúvidas Frequentes de T.I. — perguntas e respostas para o time.
// Para incluir uma nova: adicione um item em DUVIDAS (categoria agrupa na tela).

export interface Duvida {
  categoria: string;
  pergunta: string;
  /** Texto da resposta. Linhas em branco separam parágrafos. */
  resposta: string;
}

export const DUVIDAS: Duvida[] = [];
