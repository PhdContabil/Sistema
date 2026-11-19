-- Migração: Fiscal · DCTFWeb sem movimento (R-2099 na EFD-Reinf + DCTFWeb).
-- Uma linha por empresa (raiz do CNPJ) e competência em que ficou sem movimento.
-- ativa = continua sem movimento (sai da fila mensal); vira false quando o
-- movimento volta.

create table if not exists dctfweb_sem_movimento (
  id bigserial primary key,
  cnpj text not null,                    -- CNPJ completo (matriz) só dígitos
  raiz text not null,                    -- 8 dígitos
  razao_social text,
  codigoempresa integer,
  competencia text not null,             -- 'AAAA-MM': primeiro mês sem movimento
  debito_anterior numeric,               -- débito do mês anterior (prova do movimento)
  situacao text not null default 'apontada', -- apontada | r2099_enviado | r2099_aceito | r2099_erro | concluida | dispensada
  ambiente integer,                      -- 1 produção, 2 produção restrita
  id_evento text,
  protocolo text,
  recibo_r2099 text,
  erro text,
  ativa boolean not null default true,
  encerrada_em text,                     -- competência em que o movimento voltou
  dctfweb_id bigint,                     -- linha da tabela dctfweb transmitida
  por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (raiz, competencia)
);
create index if not exists idx_dsm_ativa on dctfweb_sem_movimento (ativa);
alter table dctfweb_sem_movimento enable row level security;
-- sem policies: só service_role

alter table dctfweb_parametros add column if not exists ambiente_reinf integer not null default 2 check (ambiente_reinf in (1, 2));
-- nasce em PRODUÇÃO RESTRITA (teste). Trocar para 1 só depois de validar.
