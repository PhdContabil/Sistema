# Lucros Distribuídos — contrato dos endpoints na API do Questor

O Núcleo (`app/api/contabil/lucros-distribuidos/*`) monta as linhas e chama a API
do Questor (`phdfibra.dyndns.org`). **Estes endpoints ainda não existem** e
precisam ser criados no código da API (FastAPI). Hoje o Núcleo recebe `404` e
mostra "A API do Questor ainda não tem o endpoint…", sem gravar nada.

Origem das regras: sistema Access `Contabil.accdb`, formulários
`form_lancamento_lucros_distribuidos` (botão "Inserir"),
`form_ajuste_lucros_distribuidos` e `form_log_lucros_distribuidos` (botão
"Excluir"). Não há consulta de regime tributário: vale para qualquer empresa.

Diferença em relação ao Access: o campo **Observação** (`DESCCOMPLEMENTAR`) foi
removido. A API **não** deve gravar essa coluna.

Os quatro endpoints usam as mesmas chaves e cabeçalhos do informe de rendimentos
(`X-API-Key` na leitura, `X-Write-Key` na escrita, `Idempotency-Key` quando
houver). Todas as gravações de um endpoint rodam **numa única transação** (fiscal
+ DP): se uma falhar, nenhuma é gravada.

## 1. Listar lançamentos — `GET /contabil/lucros-distribuidos`

Leitura (`X-API-Key`). Substitui o subformulário do `form_log` do Access.

```
GET /contabil/lucros-distribuidos?inicio=2026-01-01&fim=2026-12-31&codigoempresa=1415
```

`codigoempresa` é opcional. O filtro de período é sobre `OUTRORENDIMENTOPAGO.DATALCTOFIS`.
Só devolve `CODIGONATUREZARENDIMENTO = 12001`.

```json
{
  "total": 1,
  "dados": [
    {
      "codigoempresa": 1415, "nomeestab": "EMPRESA EXEMPLO LTDA",
      "chave": 33, "codigosocio": 2, "nomesocio": "FULANO DE TAL",
      "competencia": "2026-03-01", "datalctofis": "2026-03-31",
      "valorrendpago": 60000.00, "basecalcirrf": 60000.00,
      "valorimposto": 6000.00, "tipoisencao": 1
    }
  ]
}
```

`chave` = `CODIGOOUTRORENDIMENTOPAGO`. Fonte: `OUTRORENDIMENTOPAGO` com
`ESTAB` (nome) e `SOCIO` (nome), como a consulta do Access.

## 2. Lançar — `POST /contabil/lucros-distribuidos?dry_run=true|false`

```
X-Write-Key: <QUESTOR_WRITE_KEY>
Idempotency-Key: lucro:<empresa>:<socio>:<AAAA-MM>:<hash>   (e ":dry" na simulação)
```

```json
{
  "usuario": "julia@phdcontabil.com.br",
  "fiscal": {
    "codigoempresa": 1415, "codigoestab": 1, "codigosocio": 2,
    "codigonaturezarendimento": 12001,
    "competencia": "2026-03-01", "datalctofis": "2026-03-31",
    "valorrendpago": 60000, "basecalcirrf": 60000,
    "aliquota": 10, "valorimposto": 6000, "codigoimposto": 1841, "variacaoimposto": 1,
    "tipoisencao": 1, "valorisencao": 0
  },
  "dp": {
    "codigoempresa": 1415, "tipo": 2, "codigoestab": 1, "codigosocio": 2,
    "descricaorendimento": "Distribuição de lucros de 2026",
    "datapgto": "2026-03-31", "valorrendimento": 60000, "valorirrf": 0,
    "codigoimposto": 561, "variacaoimposto": 2
  }
}
```

Sem imposto retido, `aliquota`, `valorimposto`, `codigoimposto` e
`variacaoimposto` vêm `null` e **não** devem ser gravados (o Access omitia essas
colunas); `basecalcirrf` vem `0`.

O que a API calcula (não vem no corpo):

| Campo | Regra |
|---|---|
| `OUTRORENDIMENTOPAGO.CODIGOOUTRORENDIMENTOPAGO` | `max + 1` por `CODIGOEMPRESA` (1 se vazio) |
| `INFORMERENDIMENTOOUTREND.SEQ` | `max + 1` por `CODIGOEMPRESA` (1 se vazio) |
| `INFORMERENDIMENTOOUTREND.CAMPOINFORME` | `CFGEMPRESAGEM.TIPOENQUAD` da empresa (como no Access) |

Os dois `max + 1` precisam ser feitos **dentro da transação**, com trava, para
duas gravações simultâneas não pegarem o mesmo número.

Resposta (HTTP 200; em `dry_run=true` nada é gravado, mas os números mostram o
que seria usado):

```json
{ "ok": true, "dry_run": false, "chave": 33, "seq": 12, "avisos": [], "repetido": false }
```

Com a mesma `Idempotency-Key` já gravada, devolver `200` com `"repetido": true`
sem escrever de novo. Erros: `422` com `{"detail": "..."}` para validação.

## 3. Alterar — `PATCH /contabil/lucros-distribuidos/{codigoempresa}/{chave}?dry_run=true|false`

Equivale ao formulário de ajuste do Access.

```json
{
  "usuario": "julia@phdcontabil.com.br",
  "codigosocio": 2,
  "data_atual": "2026-03-31",
  "fiscal": { "...mesmos campos do item 2..." },
  "dp": { "datapgto": "2026-04-30", "valorrendimento": 70000 }
}
```

Na `OUTRORENDIMENTOPAGO` (`CODIGOEMPRESA` + `CODIGOOUTRORENDIMENTOPAGO = chave`),
atualizar: `COMPETENCIA`, `DATALCTOFIS`, `VALORRENDPAGO`, `BASECALCIRRF`,
`ALIQUOTA`, `VALORIMPOSTO`, `CODIGOIMPOSTO`, `VARIACAOIMPOSTO`, `TIPOISENCAO` e
`VALORISENCAO`.

Na `INFORMERENDIMENTOOUTREND`, a linha é achada por `CODIGOEMPRESA` +
`CODIGOSOCIO` + `DATAPGTO = data_atual` (como no Access), e recebe `DATAPGTO` e
`VALORRENDIMENTO` novos. Se **não achar exatamente uma linha**, responder `409`
sem alterar nada (o Access dava erro de `DLookup` nulo).

> Correção em relação ao Access: o ajuste lá atualizava só `VALORIMPOSTO`, sem
> `BASECALCIRRF`, e deixava `ALIQUOTA`/`CODIGOIMPOSTO` como estavam. Aqui o
> Núcleo manda o conjunto completo para a linha ficar coerente.

Lançamento inexistente → `404`.

## 4. Excluir — `DELETE /contabil/lucros-distribuidos/{codigoempresa}/{chave}`

Corpo: `{ "usuario": "...", "codigosocio": 2, "data_atual": "2026-03-31" }`.

Na mesma transação, apagar a linha de `OUTRORENDIMENTOPAGO` (`CODIGOEMPRESA` +
`CODIGOOUTRORENDIMENTOPAGO = chave`) e a linha da `INFORMERENDIMENTOOUTREND`
achada como no item 3. Se a linha da DP não existir, apagar só a fiscal e
devolver um aviso em `avisos`. Lançamento inexistente → `404`.

## Log

O Access gravava `LogOperacoes_lucros_distribuidos`. No Núcleo o log fica no
Supabase (`lucros_distribuidos_log`, ver `docs/lucros-distribuidos-migration.sql`);
a API do Questor não precisa gravar log.

## Teste sugerido para quem implementar

1. `dry_run=true` não altera nenhuma tabela.
2. Lançar duas vezes com a mesma `Idempotency-Key` grava uma vez.
3. Lançar, alterar e excluir deixa as duas tabelas como estavam antes.
4. Erro na linha da DP desfaz a linha fiscal.
