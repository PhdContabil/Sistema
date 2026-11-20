-- Grupos de processamento do DP (Questor /rh/grupos-processamento), por empresa.
-- Atualizado pela sincronização da DCTFWeb e pela carteira da Situação Fiscal.
-- Usado como filtro nas telas (vindo do app antigo: empresas.grupo_codigo/grupo_desc).
create table if not exists public.grupos_processamento (
  codigoempresa integer primary key,
  grupo_codigo  integer,
  grupo_desc    text,
  updated_at    timestamptz not null default now()
);
alter table public.grupos_processamento enable row level security;
