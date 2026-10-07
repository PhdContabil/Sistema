# Informe de Rendimentos — contrato do endpoint na API do Questor

O Núcleo (`app/api/contabil/informe-rendimentos/*`) monta os lançamentos e chama
a API do Questor (`phdfibra.dyndns.org`). **Este endpoint ainda não existe** e
precisa ser criado no código da API (FastAPI). Hoje o Núcleo recebe `404` e
mostra "A API do Questor ainda não tem o endpoint…", sem gravar nada.

Origem das regras: sistema Access `Contabil.accdb`, formulário
`form_lancamento_rendimento` (botão "Incluir").

## Chamada

```
POST /contabil/informe-rendimentos?dry_run=true|false
X-Write-Key: <QUESTOR_WRITE_KEY>
Idempotency-Key: informe:<empresa>:<AAAA-MM>:<hash>   (e ":dry" no sufixo na simulação)
Content-Type: application/json
```

Corpo (campos em minúsculas, nomes das colunas do Questor):

```json
{
  "codigoempresa": 1415,
  "competencia": "2026-08",
  "regime": "real",
  "usuario": "julia@phdcontabil.com.br",
  "ecf": [
    {
      "codigoempresa": 1415, "codigoestab": 1, "tipoimposto": 3,
      "codigooperacaofis": 45040, "datalctofis": "2026-08-01",
      "operacao": 1, "valoroutraoperacaofis": 10.85
    }
  ],
  "f100": [
    {
      "codigoempresa": 1415, "codigoestab": 1, "indoper": 2, "consideraproporc": 0,
      "compensaretencao": 1, "datalctofis": "2026-08-31", "valoroper": 10.85,
      "cst": 2, "aliqpis": 0.65, "basecalculo": 10.85, "aliqcofins": 4,
      "valorpis": 0.07, "valorcofins": 0.43, "cstcofins": 2,
      "tipodebitocofins": "4.3.05.02", "tipodebito": "4.3.05.02",
      "compensacred": 1, "origemcredito": 0, "contactb": 2659,
      "origemdado": 2, "detalhardimob": 0
    }
  ]
}
```

`seq` **não** vem no corpo: a API calcula.

## O que a API deve fazer

1. **Validar** (400/422 com `detail` em português): empresa existe e está ativa,
   `codigoestab = 1`, competência `AAAA-MM`, datas dentro da competência
   (`ecf` no dia 1, `f100` no último dia), valores ≥ 0.
2. **Lista fechada de valores** — o endpoint não pode virar escrita livre:
   - `codigooperacaofis` ∈ {45040, 45058, 45118}; `tipoimposto` = 3; `operacao` = 1
   - `cst` e `cstcofins` ∈ {2, 8}
   - `tipodebito` e `tipodebitocofins` ∈ {`4.3.15.999`, `4.3.05.02`}
   - `contactb` ∈ {2859, 2659, 2893}
   - `indoper` = 2, `origemdado` = 2
   - Se `cst` = 2: `aliqpis` = 0,65, `aliqcofins` = 4 e os valores batem com
     `round(base × alíquota, 2)`; se `cst` = 8: alíquotas e valores = 0.
3. **Calcular `seq` dentro da transação**, com trava por empresa
   (`pg_advisory_xact_lock(codigoempresa)`), para duas pessoas lançando ao mesmo
   tempo não gerarem o mesmo número (o `DMax` do Access não protegia disso):
   - `OUTRAOPERACAOECF`: `max(seq)+1` filtrando `codigoempresa`, `codigoestab = 1`,
     `tipoimposto = 3`, `codigooperacaofis` e `datalctofis` (primeiro dia do mês)
   - `EFDF100DEMAISDOC`: `max(seq)+1` filtrando `codigoempresa` (como o Access)
4. **Gravar tudo ou nada**: todas as linhas na mesma transação.
5. **Idempotência**: guardar a `Idempotency-Key` com a resposta. Repetindo a
   chave, devolver a mesma resposta com `"repetido": true`, sem escrever de novo.
6. **`dry_run=true`**: não grava (nem guarda chave); devolve as linhas com o
   `seq` que seriam usados.

## Resposta (200)

```json
{
  "ok": true,
  "dry_run": false,
  "repetido": false,
  "ecf":  [ { "seq": 3, "codigooperacaofis": 45040, "valoroutraoperacaofis": 10.85 } ],
  "f100": [ { "seq": 12, "valoroper": 10.85, "cst": 2 } ],
  "avisos": []
}
```

Erros: `{ "detail": "mensagem em português" }` com 400/422 (validação), 409
(conflito) ou 5xx. O Núcleo repassa o `detail` à tela.

## Variáveis no Núcleo (Vercel)

| Variável | Para quê |
|---|---|
| `QUESTOR_API_KEY` | leitura (lista de empresas) — já existe |
| `QUESTOR_WRITE_KEY` | escrita — já existe; confirmar se vale para este endpoint |
| `TAREFFA_CLIENT_ID`, `TAREFFA_CLIENT_SECRET`, `TAREFFA_EMAIL`, `TAREFFA_SENHA` | regime no Tareffa — já existem (DARE SP) |
| `INFORME_LUCRO_REAL_LIBERADO=1` | libera a **gravação** em Lucro Real (simular já funciona). Só ligar após confirmar os itens abaixo |

Também é preciso rodar `docs/informe-rendimentos-migration.sql` no Supabase
(tabela do log).

## Pendências para liberar o Lucro Real

- [ ] Confirmar no Questor se os códigos da ECF **45040 / 45058 / 45118** valem
      para empresas do Lucro Real (no Presumido vieram do Access).
- [ ] Confirmar se "Demais receitas" tem incidência de PIS/COFINS no Lucro Real
      (hoje gera só a ECF, como no Presumido).
- [ ] Conferir um lançamento real de Lucro Real feito à mão no Questor contra o
      que a tela simula (CST 02, 0,65% / 4,00%, débito `4.3.05.02`, conta 2659,
      compensa crédito = Sim).
- [ ] Confirmar a regra vigente de PIS/COFINS sobre receita financeira no regime
      não cumulativo com a legislação/contador responsável.

## Fora desta primeira entrega

- PDF do relatório (`rel_rendimento`, hoje salvo em `T:\Robo Tareffa\`).
- Telas de aluguel, ganho de capital e lucros distribuídos (mesmo padrão).
