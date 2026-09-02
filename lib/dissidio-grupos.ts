// Casamento entre as pastas do SharePoint e as empresas do Questor.
//
// O grupo econômico não existe no Questor — ele está na estrutura de pastas:
// uma pasta "GRUPO LBF" contém as pastas das empresas daquele grupo. Para
// levar isso ao Dissídio é preciso casar NOME DE PASTA com NOME DE EMPRESA,
// que é aproximado por natureza.
//
// Por isso o módulo é puro e testável, e a rotina que o usa mostra o resultado
// para conferência antes de gravar: casar errado aqui significa reajustar a
// empresa errada como parte de um grupo.

/** Sufixos de tipo societário e apelidos de sistema que não identificam a empresa. */
const RUIDO = [
  "ltda", "limitada", "eireli", "epp", "me", "mei", "sa", "s a", "s/a",
  "sociedade individual de advocacia", "sociedade simples", "ss",
  "em recuperacao judicial", "em liquidacao", "matriz", "filial",
];

/** Sufixos internos usados na PHD (ex.: "- ZEN", "-WPP"). */
const SUFIXO_INTERNO = /\s*[-–]\s*(zen|wpp|omee|its)\b.*$/i;

export function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reduz o nome ao que de fato identifica a empresa: sem acento, sem
 * pontuação, sem tipo societário e sem o código que às vezes vem colado
 * ("534 - BELLA BRAZOLIN" vira "bella brazolin").
 */
export function chaveEmpresa(nome: string): string {
  let s = (nome || "").replace(SUFIXO_INTERNO, "");
  s = normalizar(s);

  // Código na frente do nome, como aparece nas pastas.
  s = s.replace(/^\d{1,6}\s+/, "");
  // Código no fim ("... LTDA 534").
  s = s.replace(/\s+\d{1,6}$/, "");

  const palavras = s.split(" ").filter((p) => p && !RUIDO.includes(p));
  return palavras.join(" ").trim();
}

export interface PastaGrupo {
  /** Nome da pasta da empresa dentro do grupo. */
  nome: string;
  grupo: string;
}

export interface EmpresaAlvo {
  codigoempresa: number;
  nome: string | null;
}

/**
 * Código da empresa embutido no nome da pasta.
 *
 * As pastas costumam vir como "534 - BELLA BRAZOLIN" ou "1356-1 ASSOCIACAO
 * TRISQUEL", onde o primeiro número é o código no Questor e o segundo, quando
 * existe, é o estabelecimento. Quando dá para ler o código, ele manda: é
 * determinístico, enquanto casar por nome é sempre aproximado.
 */
export function codigoDaPasta(nome: string): number | null {
  const m = /^\s*(\d{1,6})(?:\s*-\s*\d{1,3})?\s*[-–—\s]/.exec(nome || "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type Confianca = "codigo" | "exata" | "provavel" | "ambigua";

export interface Casamento {
  codigoempresa: number;
  empresa: string;
  pasta: string;
  grupo: string;
  confianca: Confianca;
}

export interface ResultadoCasamento {
  casados: Casamento[];
  /** Pastas que não bateram com nenhuma empresa. */
  pastasSemEmpresa: PastaGrupo[];
  /** Pastas que bateram com mais de uma empresa — não gravamos, é ambíguo. */
  ambiguas: { pasta: string; grupo: string; candidatas: string[] }[];
}

/**
 * Casa pastas com empresas.
 *
 * Regras, da mais forte para a mais fraca:
 *  1. chave idêntica  → "exata"
 *  2. uma chave começa com a outra, com pelo menos 8 caracteres → "provável"
 *
 * Não fazemos correspondência por "contém" solto: nomes como "MARIA" casariam
 * com dezenas de empresas. Quando mais de uma empresa serve, a pasta vai para
 * a lista de ambíguas em vez de escolher uma no chute.
 */
export function casarGrupos(pastas: PastaGrupo[], empresas: EmpresaAlvo[]): ResultadoCasamento {
  const porChave = new Map<string, EmpresaAlvo[]>();
  for (const e of empresas) {
    const k = chaveEmpresa(e.nome ?? "");
    if (!k) continue;
    const lista = porChave.get(k) ?? [];
    lista.push(e);
    porChave.set(k, lista);
  }
  const chaves = [...porChave.keys()];

  const porCodigo = new Map<number, EmpresaAlvo>();
  for (const e of empresas) porCodigo.set(e.codigoempresa, e);

  const casados: Casamento[] = [];
  const pastasSemEmpresa: PastaGrupo[] = [];
  const ambiguas: ResultadoCasamento["ambiguas"] = [];
  const jaUsado = new Set<number>();

  for (const p of pastas) {
    // 1) Código na pasta — caminho determinístico, sem chance de erro.
    const cod = codigoDaPasta(p.nome);
    if (cod !== null) {
      const e = porCodigo.get(cod);
      if (e && !jaUsado.has(cod)) {
        jaUsado.add(cod);
        casados.push({
          codigoempresa: cod,
          empresa: e.nome ?? "",
          pasta: p.nome,
          grupo: p.grupo,
          confianca: "codigo",
        });
        continue;
      }
      // Código presente mas inexistente no Questor: reportar, não cair no nome.
      // Um número errado casado por nome seria pior do que não casar.
      if (!e) { pastasSemEmpresa.push(p); continue; }
    }

    // 2) Sem código legível, tenta pelo nome.
    const k = chaveEmpresa(p.nome);
    if (!k) { pastasSemEmpresa.push(p); continue; }

    let candidatas = porChave.get(k) ?? [];
    let confianca: Confianca = "exata";

    if (candidatas.length === 0) {
      const parecidas = chaves.filter(
        (c) =>
          (c.startsWith(k) || k.startsWith(c)) &&
          Math.min(c.length, k.length) >= 8
      );
      candidatas = parecidas.flatMap((c) => porChave.get(c) ?? []);
      confianca = "provavel";
    }

    // Uma empresa só pode pertencer a um grupo.
    candidatas = candidatas.filter((c) => !jaUsado.has(c.codigoempresa));

    if (candidatas.length === 0) {
      pastasSemEmpresa.push(p);
    } else if (candidatas.length > 1) {
      ambiguas.push({
        pasta: p.nome,
        grupo: p.grupo,
        candidatas: candidatas.map((c) => `${c.codigoempresa} — ${c.nome ?? ""}`),
      });
    } else {
      const e = candidatas[0];
      jaUsado.add(e.codigoempresa);
      casados.push({
        codigoempresa: e.codigoempresa,
        empresa: e.nome ?? "",
        pasta: p.nome,
        grupo: p.grupo,
        confianca,
      });
    }
  }

  return { casados, pastasSemEmpresa, ambiguas };
}

/** Deixa o nome do grupo apresentável: "GRUPO LBF" a partir de "grupo lbf". */
export function nomeGrupo(pasta: string): string {
  return (pasta || "").trim().replace(/\s+/g, " ").toUpperCase();
}
