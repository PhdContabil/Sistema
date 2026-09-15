// Casamento entre a planilha de controle de boletos (SharePoint) e as
// empresas do Questor, para preencher automaticamente a coluna G ("gerado")
// do Diss[i]dio.
//
// Diferente do casamento de grupos econômicos (dissidio-grupos.ts), aqui não
// há aproximação por nome: a planilha traz o CÓDIGO FINANCEIRO da empresa
// (coluna "COD Q"), que é um número exato — ou casa, ou não casa. Por isso o
// módulo é bem mais simples, mas continua puro e testável pelo mesmo motivo:
// marcar a empresa errada como "boleto gerado" trava a linha dela sem que
// ninguém tenha mandado.

export interface LinhaBoletoPlanilha {
  aba: string;
  codigofinanceiro: number;
  empresa: string | null;
  ok: boolean;
}

export interface EmpresaAlvo {
  codigoempresa: number;
  codigocliente: number | null;
  nome: string | null;
}

export interface CasamentoBoleto {
  codigoempresa: number;
  codigocliente: number;
  empresa: string | null;
  aba: string;
}

export interface ResultadoBoletos {
  /** Uma linha por empresa — só a primeira aba onde ela aparecer "ok" conta. */
  gerados: CasamentoBoleto[];
  /** Código financeiro com "ok" na planilha, mas que não existe em nenhuma empresa do Questor. */
  semEmpresa: LinhaBoletoPlanilha[];
  /** Código financeiro compartilhado por mais de uma empresa (matriz/filial) — não escolhemos no chute. */
  ambiguos: { codigofinanceiro: number; aba: string; candidatos: number[] }[];
}

/**
 * Casa as linhas "ok" da planilha com as empresas pelo código financeiro
 * (`codigocliente`). Uma empresa que já foi casada por uma aba não é
 * recasada por outra — evita contar duas vezes quem aparece em mais de uma
 * carteira.
 */
export function casarBoletos(
  linhas: LinhaBoletoPlanilha[], empresas: EmpresaAlvo[]
): ResultadoBoletos {
  const porCodigoCliente = new Map<number, EmpresaAlvo[]>();
  for (const e of empresas) {
    if (e.codigocliente === null || e.codigocliente === undefined) continue;
    const lista = porCodigoCliente.get(e.codigocliente) ?? [];
    lista.push(e);
    porCodigoCliente.set(e.codigocliente, lista);
  }

  const gerados: CasamentoBoleto[] = [];
  const semEmpresa: LinhaBoletoPlanilha[] = [];
  const ambiguos: ResultadoBoletos["ambiguos"] = [];
  const jaCasada = new Set<number>();

  for (const l of linhas) {
    if (!l.ok) continue;

    const candidatas = porCodigoCliente.get(l.codigofinanceiro) ?? [];
    if (candidatas.length === 0) {
      semEmpresa.push(l);
      continue;
    }
    if (candidatas.length > 1) {
      ambiguos.push({
        codigofinanceiro: l.codigofinanceiro,
        aba: l.aba,
        candidatos: candidatas.map((c) => c.codigoempresa),
      });
      continue;
    }

    const e = candidatas[0];
    if (jaCasada.has(e.codigoempresa)) continue;
    jaCasada.add(e.codigoempresa);
    gerados.push({
      codigoempresa: e.codigoempresa,
      codigocliente: l.codigofinanceiro,
      empresa: e.nome ?? l.empresa,
      aba: l.aba,
    });
  }

  return { gerados, semEmpresa, ambiguos };
}
