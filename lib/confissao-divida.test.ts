// node --experimental-strip-types --test lib/confissao-divida.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  paraCentavos, calcularAcordo, descreverCompetencias, montarBlocosTermo, pendenciasDoTermo, podeGerarTermo, formatBRL,
  type EntradaTermo, type LinhaBoleto,
} from "./confissao-divida.ts";

const L = (competencia: string, valor: string, id = competencia): LinhaBoleto => ({ id, descricao: "Mensalidade", competencia, valor });

test("valores digitados em formatos comuns viram centavos", () => {
  assert.equal(paraCentavos("3.417,31"), 341731);
  assert.equal(paraCentavos("3417,31"), 341731);
  assert.equal(paraCentavos("3417.31"), 341731);
  assert.equal(paraCentavos("R$ 490,04"), 49004);
  assert.equal(paraCentavos("1.000"), 100000);
  assert.equal(paraCentavos("abc"), 0);
  assert.equal(paraCentavos("-5"), 0);
  assert.equal(paraCentavos(""), 0);
});

test("entrada arredonda para baixo, parcela para cima, última fecha o saldo", () => {
  const a = calcularAcordo(2340035, 30, 10);
  assert.equal(a.entrada, 702010);
  assert.equal(a.parcela, 163803);
  assert.equal(a.entrada + a.parcela * 9 + a.ultima, 2340035);
});

test("a soma de entrada + parcelas sempre fecha o total", () => {
  for (const total of [1, 99, 12345, 2340038, 999999]) {
    for (const pct of [0, 10, 30, 33, 100]) {
      for (const n of [1, 2, 7, 10, 12]) {
        const a = calcularAcordo(total, pct, n);
        assert.equal(a.entrada + a.parcela * (n - 1) + a.ultima, total, `${total}/${pct}/${n}`);
      }
    }
  }
});

test("entrada 100% e parcelas inválidas não quebram", () => {
  const a = calcularAcordo(10000, 100, 0);
  assert.equal(a.parcelas, 1);
  assert.equal(a.entrada, 10000);
  assert.equal(a.parcela, 0);
});

test("competências: meses seguidos, um mês e meses soltos", () => {
  assert.equal(descreverCompetencias([L("2026-02", "1"), L("2026-03", "1"), L("2026-07", "1")]), "02/2026, 03/2026 e 07/2026");
  assert.equal(descreverCompetencias([L("2026-06", "1"), L("2026-07", "1")]), "06/2026 à 07/2026");
  assert.equal(descreverCompetencias([L("2026-06", "1")]), "06/2026");
  assert.equal(descreverCompetencias([L("2025-12", "1"), L("2026-01", "1")]), "12/2025 à 01/2026");
});

function entrada(extra: Partial<EntradaTermo> = {}): EntradaTermo {
  return {
    empresas: [
      { codigoempresa: 1, nome: "EMPRESA UM LTDA", cnpj: null, linhas: [L("2026-02", "3.417,31"), L("2026-03", "3.417,31")] },
      { codigoempresa: 2, nome: "EMPRESA DOIS ME", cnpj: null, linhas: [L("2026-06", "490,04"), L("", "")] },
    ],
    pct: 30,
    parcelas: 10,
    devedor: { nome: "Fulano de Tal", nacionalidade: "brasileiro", profissao: "Empresário", endereco: "Rua A, 1" },
    testemunhas: ["Ana", "Beto"],
    dataIso: "2026-11-03",
    ...extra,
  };
}

test("o termo traz total, empresas, acordo e data por extenso", () => {
  const { blocos, acordo } = montarBlocosTermo(entrada());
  const texto = blocos.map((b) => ("text" in b ? b.text : b.l + " | " + b.r)).join("\n");
  assert.equal(acordo.total, 683462 + 49004);
  assert.match(texto, /confessa dever ao credor é de R\$ 7\.324,66/);
  assert.match(texto, /referentes à 02 empresas:/);
  assert.match(texto, /Mensalidade 02\/2026 à 03\/2026 – Total R\$ 6\.834,62/);
  assert.match(texto, /Mensalidade 06\/2026 – Total R\$ 490,04/);
  assert.match(texto, /TOTALIZANDO R\$ 7\.324,66/);
  assert.match(texto, /São Paulo, 3 de Novembro de 2026/);
  assert.match(texto, /Devedor - Fulano de Tal/);
  assert.match(texto, /Testemunha – Ana \| Testemunha – Beto/);
});

test("empresa sem boleto válido não aparece e o singular é usado", () => {
  const e = entrada();
  e.empresas[1].linhas = [L("", "")];
  const texto = montarBlocosTermo(e).blocos.map((b) => ("text" in b ? b.text : "")).join("\n");
  assert.match(texto, /referentes à 01 empresa:/);
  assert.doesNotMatch(texto, /EMPRESA DOIS/);
});

test("sem entrada o texto não fala em entrada", () => {
  const texto = montarBlocosTermo(entrada({ pct: 0 })).blocos.map((b) => ("text" in b ? b.text : "")).join("\n");
  assert.doesNotMatch(texto, /entrada de/);
  assert.match(texto, /Acordo de Dívidas, em 10 parcelas/);
});

test("pendências: devedor, endereço, linhas incompletas e sem boletos", () => {
  const ok = { nome: "X", nacionalidade: "", profissao: "", endereco: "Y" };
  // a linha totalmente em branco não conta como incompleta; uma só com valor, sim
  assert.deepEqual(pendenciasDoTermo(entrada({ devedor: ok })), []);
  const e = entrada({ devedor: ok });
  e.empresas[1].linhas.push(L("2026-07", ""));
  assert.deepEqual(pendenciasDoTermo(e), ["EMPRESA DOIS ME: 1 linha incompleta (fica fora do termo)."]);
  const p = pendenciasDoTermo(entrada({ devedor: { nome: "", nacionalidade: "", profissao: "", endereco: "" } }));
  assert.ok(p.includes("Preencha o nome do devedor."));
  assert.ok(p.includes("Preencha o endereço do devedor."));
  assert.equal(pendenciasDoTermo(entrada({ empresas: [] }))[0], "Marque pelo menos uma empresa.");
  assert.ok(pendenciasDoTermo(entrada({ empresas: [{ codigoempresa: 1, nome: "A", cnpj: null, linhas: [L("", "")] }] })).includes("Digite pelo menos um boleto com competência e valor."));
});

test("formatBRL", () => {
  assert.equal(formatBRL(2340035), "R$ 23.400,35");
});

test("só bloqueia o PDF o que é essencial; linha incompleta é só aviso", () => {
  const ok = { nome: "X", nacionalidade: "", profissao: "", endereco: "Y" };
  const e = entrada({ devedor: ok });
  e.empresas[1].linhas.push(L("2026-07", ""));
  assert.equal(podeGerarTermo(e), true);
  assert.equal(podeGerarTermo(entrada({ devedor: { ...ok, nome: " " } })), false);
  assert.equal(podeGerarTermo(entrada({ devedor: { ...ok, endereco: "" } })), false);
  assert.equal(podeGerarTermo(entrada({ empresas: [] })), false);
});
