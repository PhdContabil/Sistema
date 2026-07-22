# Núcleo Contábil

Sistema principal da contabilidade PHD — **Next.js + Vercel**, com Supabase como base para autenticação e módulos futuros.

Navegação em **launcher** (escolha do módulo) + **workspace** (módulos sempre à vista), tema claro/escuro, e telas que consomem a API Questor (somente-leitura).

## Módulos e aplicações

- **Fiscal** — Simples Nacional (análise de limite) e DCTFWeb obrigadas *(ativos)*; Apuração de Impostos, Notas Fiscais, SPED Fiscal, Obrigações Acessórias *(em breve)*.
- **Financeiro** — Conciliação de Honorários *(ativo)*; Contas a Pagar/Receber, Fluxo de Caixa, Conciliação Bancária, DRE *(em breve)*.
- **Trabalhista, Paralegal, Contábil, Societário** — *em breve*.

## Como funciona

- As telas ativas consomem a API Questor via rotas server-side (`app/api/**`).
- A chave `X-API-Key` fica **somente no servidor** (variável `QUESTOR_API_KEY`), nunca no navegador — dados PII sob a LGPD.
- Sem a chave configurada, as telas exibem dados de exemplo.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha QUESTOR_API_KEY
npm run dev
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `QUESTOR_API_URL` | Base da API (padrão `https://phdfibra.dyndns.org`) |
| `QUESTOR_API_KEY` | Chave da API Questor (server-side apenas) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (módulos futuros) |

## Deploy (Vercel)

Definir `QUESTOR_API_KEY` em *Environment Variables* e fazer o deploy. Framework detectado automaticamente (Next.js).

## Estrutura

```
app/
  page.tsx                    # launcher (home)
  m/[modulo]/page.tsx         # workspace do módulo (cards de apps)
  m/fiscal/simples, m/fiscal/dctfweb, m/financeiro/conciliacao
  api/**                      # proxies server-side da API Questor
components/  Workspace, ThemeToggle, apps/*
lib/         modules, questor, conciliacao, fiscal, sample*
```
