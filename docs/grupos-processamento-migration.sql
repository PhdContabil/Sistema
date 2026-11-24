-- Grupos de processamento do DP (Questor /rh/grupos-processamento), por empresa.
-- Uma empresa pode estar em vários grupos: chave (codigoempresa, grupo_codigo).
-- Atualizado pela sincronização da DCTFWeb e pela carteira da Situação Fiscal.
create table if not exists public.grupos_processamento (
  codigoempresa integer not null,
  grupo_codigo  integer not null,
  grupo_desc    text,
  updated_at    timestamptz not null default now(),
  primary key (codigoempresa, grupo_codigo)
);
alter table public.grupos_processamento enable row level security;
