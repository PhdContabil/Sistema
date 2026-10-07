-- Migração: Contábil · Informe de Rendimentos (substitui as tabelas
-- LogOperacoes* do Access). Rodar no SQL Editor do Supabase.
--
-- Só a service role lê e escreve (as rotas do Núcleo usam
-- SUPABASE_SERVICE_ROLE_KEY): RLS ligado, sem política.

create table if not exists informe_rendimentos_log (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  codigoempresa integer not null,
  nome_empresa text,
  competencia text not null,          -- "AAAA-MM"
  regime text not null,               -- presumido | real
  rendimento numeric(14,2) not null default 0,
  demais_receitas numeric(14,2) not null default 0,
  dividendos numeric(14,2) not null default 0,
  retencao numeric(14,2) not null default 0,
  pis numeric(14,2) not null default 0,
  cofins numeric(14,2) not null default 0,
  status text not null,               -- lancado | erro
  responsavel text not null,          -- e-mail de quem lançou
  idempotency_key text not null,
  resposta jsonb,                     -- o que a API do Questor devolveu (linhas e SEQ)
  erro text
);

create index if not exists idx_informe_log_empresa_comp
  on informe_rendimentos_log (codigoempresa, competencia);
create index if not exists idx_informe_log_criado_em
  on informe_rendimentos_log (criado_em desc);

-- Um mesmo lançamento (mesma chave) só pode constar como "lancado" uma vez.
create unique index if not exists uq_informe_log_lancado
  on informe_rendimentos_log (idempotency_key) where status = 'lancado';

alter table informe_rendimentos_log enable row level security;
