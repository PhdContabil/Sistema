-- Sistema MEI: dados do cliente que existem só no Núcleo (não vão para o Questor).
-- Rodar no SQL Editor do Supabase (projeto system-contabilidade).
create table if not exists public.mei_cliente_extra (
  codigoempresa  integer primary key,   -- código do MEI no Questor
  nome_social    text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
alter table public.mei_cliente_extra enable row level security;
-- Sem políticas: só o servidor (service role) lê e grava, pela rota /api/mei/extra.
