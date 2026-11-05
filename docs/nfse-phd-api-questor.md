# API do Questor — RPS da PHD para emissão de NFS-e

**Para:** dev da API do Questor (https://phdfibra.dyndns.org)
**De:** Núcleo Contábil (Financeiro › Emissão NFS-e PHD)
**Data:** 05/11/2026

## Contexto

Hoje o Financeiro emite as NFS-e da própria PHD (Taboão da Serra, Simples Nacional)
com um app Python local (`phd_nfse`): roda uma query no **nSQL**, exporta CSV, coloca
na pasta `inbox\` e o app emite nota por nota no webservice da prefeitura
(eTransparência), baixa o PDF e publica no Zen.

Esse emissor passou para dentro do **Núcleo** (emissão, PDF e Zen). Falta só tirar o
CSV: o Núcleo precisa buscar as RPS direto na API, mostrar na tela e o Financeiro
**marca quais quer emitir**.

## O que precisamos

### 1. `GET /financeiro/nfse/rps` — RPS da PHD a emitir (leitura)

Mesma informação da query do nSQL que gera o CSV hoje, em JSON.

**Parâmetros (query):**

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `codigoempresa` | não | Empresa emissora. Padrão **725** (PHD CONTABIL LTDA, CNPJ 11.274.011/0001-86). |
| `data_inicio` / `data_fim` | um dos filtros | Período pela data da prestação (`YYYY-MM-DD`). |
| `rps_inicio` / `rps_fim` | um dos filtros | Faixa de número de RPS (como os nomes dos CSVs: "nf 13300 a 13377"). |
| `serie` | não | Série do RPS. Padrão `NF`. |

**Resposta:**

```json
{
  "total": 2,
  "dados": [
    {
      "rps_serie": "NF",
      "rps_numero": 13407,
      "data_prestacao": "2026-09-30",
      "valor_nota": 552.31,
      "observacao_nota": "(Valor aproximado de Tributos  R$0,00)",
      "tipo_pessoa": "J",
      "cpf_cnpj": "61085212000103",
      "razao_social": "ANTUNES INCORPORADORA E INVESTIMENTOS LTDA",
      "inscricao_municipal": "",
      "email": "paralegal@phdcontabil.com.br",
      "tipo_logradouro": "Rua",
      "logradouro": "Luiz Carlos Ventura",
      "numero_endereco": "99",
      "complemento": "SALA 03",
      "bairro": "Jardim Mituzi",
      "municipio": "TABOAO DA SERRA",
      "uf": "SP",
      "cep": "06775270",
      "descricao_servico": "Folha de Pagamento - Qtd: 1.00 - Valor: R$ 110.46 | Contabilidade Geral - ...",
      "codigo_servico": "17.19",
      "codigocliente": 1234,
      "cancelado": false
    }
  ]
}
```

**Regras e cuidados (são os problemas que o app atual corrige no CSV):**

- `rps_numero` como **número** (no CSV vem "13.407" com ponto de milhar).
- `valor_nota` como número com ponto decimal (no CSV vem "552,31").
- `cep` com **8 dígitos**, com zero à esquerda (a exportação numérica do CSV perde o zero: "4015000").
- `cpf_cnpj` só dígitos; CPF com 11, CNPJ com 14.
- Texto em **UTF-8**: no CSV os acentos chegam quebrados ("Escritura��o").
- Ordenado por `rps_numero` crescente: a prefeitura exige a sequência.
- Incluir as RPS **canceladas** com `cancelado: true` (não emitir, mas mostrar), se existir esse status no Questor.
- `codigocliente`: código do cliente no Questor, se houver (ajuda a conferir).

### 2. (opcional) Gravar o número da NFS-e de volta no Questor

Depois de emitida, o Núcleo sabe o **número da NFS-e**, a série e o código de verificação.
Se o Questor tiver onde guardar isso no RPS (para a conferência do Financeiro e da
contabilidade), uma rota de escrita resolveria:

`PATCH /financeiro/nfse/rps/{serie}/{numero}` com `{ "usuario", "numero_nfse", "serie_nfse", "codigo_verificacao", "data_emissao" }`

No padrão das outras escritas: `X-Write-Key`, `dry_run` explícito e `Idempotency-Key`.
Se o Questor não tiver esse campo, ignore este item.

## Quem usa e como

- **Consumidor:** Núcleo Contábil (Next.js na Vercel), só no servidor, com `X-API-Key`.
- **Fluxo:** o Financeiro escolhe o período ou a faixa de RPS, o Núcleo chama a rota, mostra a lista com a validação de cada linha, o usuário marca as notas e o Núcleo emite em ordem de RPS.
- **Enquanto a rota não existir**, a tela do Núcleo aceita o mesmo CSV de hoje (upload), para não parar o Financeiro.
