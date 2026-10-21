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
//
// REAPROVEITAR O QUE JÁ FOI LIDO. O resultado de uma leitura (o CNPJ achado, ou "li
// tudo e não achei") só depende do arquivo (id + data de modificação no SharePoint),
// do CNPJ do cadastro da empresa e da versão do leitor. Então, enquanto nada disso
// mudar, cada nova varredura reaproveita o que está guardado em vez de baixar o PDF e
// fazer OCR de novo (o OCR é o maior consumo de CPU do sistema). Só volta a ler quando:
//   - o arquivo mudou, sumiu ou apareceu um novo (esse novo é o único lido);
//   - o CNPJ do cadastro mudou e o guardado deixou de servir;
//   - o leitor melhorou (alguém aumentou VERSAO_LEITURA);
//   - passaram VALIDADE_BUSCA_PARCIAL_MS (revalidação de segurança).
// As consultas leves — lista da pasta, cadastro do Questor e cliente no Zen — continuam
// sendo feitas a cada varredura, porque o resultado delas pode mudar sem o PDF mudar.

/** Quantas vezes seguidas a busca de uma empresa pode continuar antes de desistir
 * (cada vez = uma chamada com orçamento novo de 40 s). Evita laço infinito se
 * algo impedir o progresso. */
export const MAX_PASSOS_BUSCA = 8;

/** Passado esse tempo, o que ficou guardado não vale mais (os arquivos podem ter
 * mudado de jeito que o SharePoint não acusou...): a busca recomeça do zero. É a
 * revalidação de segurança — o dia a dia é coberto pela versão do arquivo (id + data
 * de modificação no SharePoint) e pela VERSAO_LEITURA.
 * 90 dias (era 7): com a varredura semanal, 7 dias fazia TODA varredura refazer o OCR de
 * todos os PDFs, o que mais gastava CPU na Vercel (valor do commit 0c2bdb9). */
export const VALIDADE_BUSCA_PARCIAL_MS = 90 * 24 * 3_600_000;

/** Versão do LEITOR de PDF (texto nativo + OCR + conferência do CNPJ). Tudo o que ficou
 * guardado por uma versão MENOR que esta é ignorado e o documento é lido de novo. AUMENTE
 * este número sempre que a leitura mudar de um jeito que pode dar outro resultado para o
 * mesmo arquivo (ex.: a segunda leitura do OCR, PR #41) — senão o robô continuaria
 * reaproveitando um "não achei" que o leitor novo já saberia achar.
 *   1 = primeira versão com reaproveitamento (já inclui a segunda leitura do OCR). */
export const VERSAO_LEITURA = 1;

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
  /** CNPJs VÁLIDOS que o documento cita, quando ele foi descartado por nenhum deles ser o
   * do cadastro da empresa no Questor (ver conferencia-cnpj.ts). Guardado pra que a
   * próxima tentativa não precise ler o PDF de novo só pra saber o que ele cita. */
  cnpjs_lidos?: string[];
  /** Documento escaneado já lido pelas DUAS leituras do OCR (ver lerDeNovoComSegmentacaoAutomatica
   * em certidao-parser.ts), ou que nem adianta ler de novo (falhou ao ler). Um escaneado SEM esta
   * marca foi lido só pela primeira leitura: quando há CNPJ de referência ele é lido outra vez. */
  leitura_completa?: boolean;
  /** Versão do leitor (VERSAO_LEITURA) que produziu esta linha. Sem ela (guardado antes
   * deste campo existir) a linha é ignorada: o documento é lido de novo uma vez. */
  leitura_versao?: number;
  /** NÃO é um documento lido em busca de CNPJ: só guarda se o PDF "parece escaneado" (a
   * checagem rápida, sem OCR, dos documentos que a busca nem precisou abrir porque o CNPJ
   * já tinha saído de outro). Nunca conta como "lido sem CNPJ". */
  apenas_escaneio?: boolean;
}

/** Documento de onde saiu o CNPJ da última vez. */
export interface DocVencedor {
  id: string;
  nome: string;
  modificado_em: string | null;
  /** O CNPJ que foi aceito a partir dele (formato do documento). Com ele, enquanto o arquivo e o
   * CNPJ do cadastro continuarem os mesmos, não é preciso abrir o PDF de novo. */
  cnpj?: string;
  /** O documento "parece escaneado"? (entra na contagem de escaneados sem baixar o PDF). */
  escaneado?: boolean;
  /** Versão do leitor (VERSAO_LEITURA) que leu o CNPJ. Sem ela o `cnpj` guardado não é usado. */
  leitura_versao?: number;
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
  /** O vencedor da última vez, se ainda está na pasta na mesma versão (serve pra tentá-lo primeiro). */
  vencedor: ArquivoBasico | null;
  /** O vencedor COM o CNPJ lido dele, quando dá pra confiar nele sem abrir o PDF: o arquivo está na
   * mesma versão, o leitor é o de hoje e a revalidação não venceu. (Se o CNPJ ainda serve para o
   * cadastro de hoje, quem decide é quem chama.) */
  vencedorLido: DocVencedor | null;
  /** "Parece escaneado?" dos documentos atuais que a busca nem precisou abrir, por id
   * (só os que continuam na mesma versão). */
  escaneio: Map<string, boolean>;
  /** Chamadas já gastas nesta busca (0 = busca nova). */
  passos: number;
  /** Já gastou todas as chamadas permitidas? */
  esgotada: boolean;
}

/** O que foi guardado por esta versão do leitor (ou mais nova) ainda vale? */
export function leituraVale(guardado: { leitura_versao?: number }): boolean {
  return typeof guardado.leitura_versao === "number" && guardado.leitura_versao >= VERSAO_LEITURA;
}

/**
 * O que dá pra aproveitar do que ficou guardado, diante dos documentos que
 * estão na pasta AGORA. Nunca devolve algo de um arquivo que mudou ou sumiu, nem de uma
 * versão antiga do leitor, nem de uma busca que passou da validade.
 */
export function aproveitarBuscaParcial(
  elegiveis: ArquivoBasico[],
  busca: BuscaParcial | null,
  agora: number
): Aproveitamento {
  const vazio: Aproveitamento = {
    tentados: new Map(),
    vencedor: null,
    vencedorLido: null,
    escaneio: new Map(),
    passos: 0,
    esgotada: false,
  };
  if (!busca) return vazio;

  const vencedor = busca.vencedor ? (elegiveis.find((d) => mesmaVersao(d, busca.vencedor!)) ?? null) : null;

  const quando = Date.parse(busca.atualizado_em);
  const vencida = !Number.isFinite(quando) || agora - quando > VALIDADE_BUSCA_PARCIAL_MS;
  if (vencida) return { ...vazio, vencedor };

  const vencedorLido =
    vencedor && busca.vencedor && busca.vencedor.cnpj && leituraVale(busca.vencedor) ? busca.vencedor : null;

  const tentados = new Map<string, DocTentado>();
  const escaneio = new Map<string, boolean>();
  for (const guardado of busca.documentos) {
    if (!leituraVale(guardado)) continue;
    const atual = elegiveis.find((d) => mesmaVersao(d, guardado));
    if (!atual) continue;
    if (guardado.apenas_escaneio) escaneio.set(atual.id, !!guardado.escaneado);
    else tentados.set(atual.id, guardado);
  }
  // Se nenhum documento lido sem CNPJ vale mais (todos os arquivos mudaram), a busca é nova.
  if (tentados.size === 0) return { ...vazio, vencedor, vencedorLido, escaneio };

  const passos = Math.max(0, Math.floor(busca.passos) || 0);
  return { tentados, vencedor, vencedorLido, escaneio, passos, esgotada: passos >= MAX_PASSOS_BUSCA };
}

/** Candidatos na ordem de sempre, mas com o vencedor da última vez na frente. */
export function ordenarComVencedor<T extends ArquivoBasico>(candidatos: T[], vencedor: ArquivoBasico | null): T[] {
  if (!vencedor) return candidatos;
  const dele = candidatos.find((c) => c.id === vencedor.id);
  if (!dele) return candidatos;
  return [dele, ...candidatos.filter((c) => c.id !== vencedor.id)];
}
