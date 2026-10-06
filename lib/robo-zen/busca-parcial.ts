// "Continuar de onde parou" na busca do CNPJ — lógica PURA (sem banco, sem
// SharePoint, sem imports), pra poder ser testada de ponta a ponta.
//
// O problema: a busca do CNPJ de UMA empresa tem um orçamento de tempo (40 s,
// ver ORCAMENTO_TEMPO_EXTRACAO_MS em preparar-empresa.ts) porque a função da
// Vercel é morta aos 60 s. Empresa com vários PDFs digitalizados (OCR é lento)
// estoura o orçamento SEMPRE no mesmo ponto: a busca começa do primeiro
// documento, gasta os 40 s nos mesmos de sempre, e o documento que tem o CNPJ
// (lá no fim da lista) nunca é lido — repetir a tentativa não adianta.
//
// A solução: guardar quais documentos já foram lidos sem achar CNPJ (tabela
// robo_zen_busca_parcial) e, na tentativa seguinte, pular esses e gastar o
// orçamento nos que faltam. Cada documento é identificado por (id, última
// modificação no SharePoint): se alguém trocar o arquivo, ele volta a ser lido.
//
// Também guarda o documento "vencedor" (o que deu o CNPJ da última vez), pra
// tentá-lo primeiro: o envio individual e as próximas varreduras não precisam
// refazer o OCR de tudo até chegar nele.

/** Quantas vezes seguidas a busca de uma empresa pode continuar antes de desistir
 * (cada vez = uma chamada com orçamento novo de 40 s). Evita laço infinito se
 * algo impedir o progresso. */
export const MAX_PASSOS_BUSCA = 8;

/** Passado esse tempo, o que ficou guardado de uma busca incompleta não vale mais
 * (os arquivos podem ter mudado de jeito que o SharePoint não acusou, o leitor de
 * PDF pode ter melhorado...): a busca recomeça do zero. */
export const VALIDADE_BUSCA_PARCIAL_MS = 7 * 24 * 3_600_000;

/** Documento já lido nesta empresa que NÃO tinha CNPJ. */
export interface DocTentado {
  id: string;
  nome: string;
  /** lastModifiedDateTime do arquivo no SharePoint quando foi lido. */
  modificado_em: string | null;
  /** A mesma mensagem que entra no status ("arquivo.pdf: tinha texto, mas…"). */
  problema: string | null;
  /** O documento "parece escaneado" (ou nem deu pra ler)? */
  escaneado: boolean;
}

/** Documento de onde saiu o CNPJ da última vez. */
export interface DocVencedor {
  id: string;
  nome: string;
  modificado_em: string | null;
}

/** O que fica guardado por empresa (uma linha em robo_zen_busca_parcial). */
export interface BuscaParcial {
  documentos: DocTentado[];
  vencedor: DocVencedor | null;
  /** Quantas chamadas seguidas já foram gastas nesta busca. */
  passos: number;
  atualizado_em: string;
}

export interface ArquivoBasico {
  id: string;
  nome: string;
  modificadoEm?: string | null;
}

/** Mesmo arquivo, na mesma versão? (Sem data dos dois lados também conta como igual.) */
export function mesmaVersao(arquivo: ArquivoBasico, guardado: { id: string; modificado_em: string | null }): boolean {
  return arquivo.id === guardado.id && (arquivo.modificadoEm ?? null) === (guardado.modificado_em ?? null);
}

export interface Aproveitamento {
  /** Documentos atuais já lidos sem CNPJ, por id (só os que continuam na mesma versão). */
  tentados: Map<string, DocTentado>;
  /** O vencedor da última vez, se ainda está na pasta na mesma versão. */
  vencedor: ArquivoBasico | null;
  /** Chamadas já gastas nesta busca (0 = busca nova). */
  passos: number;
  /** Já gastou todas as chamadas permitidas? */
  esgotada: boolean;
}

/**
 * O que dá pra aproveitar do que ficou guardado, diante dos documentos que
 * estão na pasta AGORA. Nunca devolve algo de um arquivo que mudou ou sumiu.
 */
export function aproveitarBuscaParcial(
  elegiveis: ArquivoBasico[],
  busca: BuscaParcial | null,
  agora: number
): Aproveitamento {
  const vazio: Aproveitamento = { tentados: new Map(), vencedor: null, passos: 0, esgotada: false };
  if (!busca) return vazio;

  const vencedor = busca.vencedor ? (elegiveis.find((d) => mesmaVersao(d, busca.vencedor!)) ?? null) : null;

  const quando = Date.parse(busca.atualizado_em);
  const vencida = !Number.isFinite(quando) || agora - quando > VALIDADE_BUSCA_PARCIAL_MS;
  if (vencida) return { ...vazio, vencedor };

  const tentados = new Map<string, DocTentado>();
  for (const guardado of busca.documentos) {
    const atual = elegiveis.find((d) => mesmaVersao(d, guardado));
    if (atual) tentados.set(atual.id, guardado);
  }
  // Se nada do que foi guardado vale mais (todos os arquivos mudaram), a busca é nova.
  if (tentados.size === 0) return { ...vazio, vencedor };

  const passos = Math.max(0, Math.floor(busca.passos) || 0);
  return { tentados, vencedor, passos, esgotada: passos >= MAX_PASSOS_BUSCA };
}

/** Candidatos na ordem de sempre, mas com o vencedor da última vez na frente. */
export function ordenarComVencedor<T extends ArquivoBasico>(candidatos: T[], vencedor: ArquivoBasico | null): T[] {
  if (!vencedor) return candidatos;
  const dele = candidatos.find((c) => c.id === vencedor.id);
  if (!dele) return candidatos;
  return [dele, ...candidatos.filter((c) => c.id !== vencedor.id)];
}
