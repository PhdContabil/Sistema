// Escolha da empresa a partir do que a pessoa digitou (código ou parte do nome).
//
// Por que existe: a busca antiga percorria as empresas em ordem e devolvia a PRIMEIRA que "continha" o texto
// no nome ou na pasta. A pasta de cada empresa termina com o código ("MMR Servicos Medicos Ss_3005"), então
// digitar o código 005 achava a MMR (3005) antes da Studio 54 (005) — e o envio era preparado para a empresa
// errada. O código exato nunca tinha prioridade, apesar de a tela prometer isso.
//
// Regra agora, em ordem (a primeira que acertar vale):
//   1. CÓDIGO EXATO (005 só casa com 005, nunca com 3005);
//   2. nome (ou nome da pasta) IGUAL ao digitado;
//   3. nome (ou nome da pasta) que CONTÉM o digitado — e a parte "_código" da pasta nunca entra aqui, para
//      um código não casar "por dentro" do código de outra empresa.

export interface EmpresaBuscavel {
  codigo: string;
  nome: string;
  /** Caminho da pasta, ex.: "Grupo ACM/ACM Alcopla Comércio de Chapas_576". */
  caminho: string;
}

/** Minúsculas, sem acento, sem espaço nas pontas (mesmo critério para quem digita e para o que está salvo). */
export function normalizarBusca(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Nome da pasta da empresa SEM o sufixo "_<código>" ("MMR Servicos Medicos Ss_3005" → "MMR Servicos Medicos Ss"). */
export function nomeDaPastaSemCodigo(caminho: string): string {
  const ultima = (caminho || "").split("/").pop() ?? "";
  return ultima.replace(/_\d+\s*$/, "").trim();
}

/** Texto digitado só com dígitos = é um código, não um pedaço de nome. */
export function pareceCodigo(busca: string): boolean {
  return /^\d+$/.test((busca || "").trim());
}

export function escolherEmpresa<T extends EmpresaBuscavel>(empresas: T[], busca: string): T | null {
  const alvo = normalizarBusca(busca);
  if (!alvo) return null;

  // 1) código exato
  const porCodigo = empresas.find((e) => normalizarBusca(e.codigo) === alvo);
  if (porCodigo) return porCodigo;

  // 2) nome igual
  const porNomeIgual = empresas.find(
    (e) => normalizarBusca(e.nome) === alvo || normalizarBusca(nomeDaPastaSemCodigo(e.caminho)) === alvo
  );
  if (porNomeIgual) return porNomeIgual;

  // 3) nome contém
  return (
    empresas.find(
      (e) =>
        normalizarBusca(e.nome).includes(alvo) || normalizarBusca(nomeDaPastaSemCodigo(e.caminho)).includes(alvo)
    ) ?? null
  );
}
