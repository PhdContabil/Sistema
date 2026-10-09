-- Migração: Contábil · Lucros Distribuídos (substitui a tabela
-- LogOperacoes_lucros_distribuidos do Access). Rodar no SQL Editor do Supabase.
--
-- Só a service role lê e escreve (as rotas do Núcleo usam
-- SUPABASE_SERVICE_ROLE_KEY): RLS ligado, sem política.

create table if not exists lucros_distribuidos_log (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  operacao text not null,             -- lancamento | ajuste | exclusao
  codigoempresa integer not null,
  nome_empresa text,
  codigosocio integer not null,
  nome_socio text,
  competencia text not null,          -- "AAAA-MM"
  data_pagamento date,
  rendimento numeric(14,2) not null default 0,
  imposto numeric(14,2) not null default 0,
  status text not null,               -- lancado | erro | excluido
  responsavel text not null,          -- e-mail de quem operou
  idempotency_key text not null,
  chave_questor integer,              -- CODIGOOUTRORENDIMENTOPAGO devolvido pela API
  resposta jsonb,
  erro text,
  origem text not null default 'nucleo', -- nucleo | access (histórico importado)
  id_access integer,                  -- ID da linha em LogOperacoes_lucros_distribuidos (SharePoint)
  teste boolean not null default false -- lançamento de teste do Access
);

create index if not exists idx_lucros_log_empresa_comp
  on lucros_distribuidos_log (codigoempresa, competencia);
create index if not exists idx_lucros_log_criado_em
  on lucros_distribuidos_log (criado_em desc);
create index if not exists idx_lucros_log_chave
  on lucros_distribuidos_log (codigoempresa, chave_questor);

-- Um mesmo lançamento (mesma chave) só consta como "lancado" uma vez. Ao
-- excluir, o lançamento original passa a "excluido" e a chave fica livre.
create unique index if not exists uq_lucros_log_lancado
  on lucros_distribuidos_log (idempotency_key)
  where operacao = 'lancamento' and status = 'lancado';

-- Reimportar o histórico do Access não duplica: o mesmo ID só entra uma vez.
create unique index if not exists uq_lucros_log_access
  on lucros_distribuidos_log (id_access) where origem = 'access';

alter table lucros_distribuidos_log enable row level security;
