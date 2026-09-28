// Formatação dos campos da guia para o Edoc do Questor Zen.
//
// Módulo sem import nenhum, de propósito: `node --experimental-strip-types`
// não resolve caminho relativo sem extensão, e a extensão quebraria o build
// do Next. Como estas três funções são a parte que dá errado em silêncio
// (atributo em branco, barra no nome do arquivo), elas precisam de teste.

/** "AAAA-MM-DD" → "DD/MM/AAAA", que é o formato que o Zen espera. */
export function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Valor em texto com vírgula decimal, como o Zen grava no atributo. */
export function valorBR(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

/**
 * Nome do arquivo no Edoc.
 *
 * Competência com barra viraria caminho na URL do upload, então vira hífen.
 * O CNPJ entra para o arquivo ser identificável mesmo fora da pasta do
 * cliente.
 */
export function nomeDoArquivo(cnpj: string, referencia: string): string {
  const doc = (cnpj ?? "").replace(/\D/g, "");
  const comp = (referencia ?? "").replace("/", "-");
  return `DARE-SP ${comp} ${doc}.pdf`;
}

// ------------------------------------------------------------- categorias

export interface NoCategoria {
  Codigo?: string;
  Descricao?: string;
  Categorias?: NoCategoria[];
  [k: string]: unknown;
}

/** "  Tributário " -> "tributario": o que importa é o nome, não a grafia. */
export function normalizar(t: string): string {
  return (t ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Acha o código da categoria `filha` dentro de `pai`, em qualquer nível.
 *
 * Preferência: filha dentro do pai. Se o pai não existir com esse nome, mas
 * houver UMA só categoria chamada `filha` na árvore inteira, ela serve —
 * nome específico o bastante para não ser ambíguo. Havendo mais de uma, não
 * chuta: devolve null.
 */
export function acharCategoria(arvore: NoCategoria[], pai: string, filha: string): string | null {
  const np = normalizar(pai);
  const nf = normalizar(filha);

  const dentro = (nos: NoCategoria[] | undefined): string | null => {
    for (const n of nos ?? []) {
      if (normalizar(n.Descricao ?? "") === nf && n.Codigo) return String(n.Codigo);
      const r = dentro(n.Categorias);
      if (r) return r;
    }
    return null;
  };

  const visitarPais = (nos: NoCategoria[] | undefined): string | null => {
    for (const n of nos ?? []) {
      if (normalizar(n.Descricao ?? "") === np) {
        const r = dentro(n.Categorias);
        if (r) return r;
      }
      const r = visitarPais(n.Categorias);
      if (r) return r;
    }
    return null;
  };

  const r = visitarPais(arvore);
  if (r) return r;

  const achados: string[] = [];
  const todos = (nos: NoCategoria[] | undefined) => {
    for (const n of nos ?? []) {
      if (normalizar(n.Descricao ?? "") === nf && n.Codigo) achados.push(String(n.Codigo));
      todos(n.Categorias);
    }
  };
  todos(arvore);
  return achados.length === 1 ? achados[0] : null;
}

/** "Pai › Filha" de cada folha, para a mensagem de erro dizer o que existe. */
export function listarCategorias(arvore: NoCategoria[], prefixo = ""): string[] {
  const out: string[] = [];
  for (const n of arvore ?? []) {
    const nome = `${prefixo}${n.Descricao ?? "?"}`;
    if (n.Categorias?.length) out.push(...listarCategorias(n.Categorias, `${nome} › `));
    else out.push(nome);
  }
  return out;
}
