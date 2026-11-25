-- Fiscal › Notas Fiscais: empresas emissoras cadastradas, tomadores e cancelamento.
create table if not exists fiscal_nfse_empresas (
  codigoempresa int primary key,
  nome text not null,
  cnpj text not null,
  regime text,
  grupo_codigo int,             -- empresa do grupo a que pertence (ex.: o salão)
  grupo_nome text,
  c_trib_nac text,              -- código nacional (6 dígitos)
  c_trib_mun text,              -- código municipal (3 dígitos, opcional)
  c_nbs text,                   -- NBS (9 dígitos)
  descricao_padrao text,
  info_compl_padrao text,
  ativo boolean not null default true,
  criado_por text, criado_em timestamptz default now(),
  atualizado_por text, atualizado_em timestamptz default now()
);
create index if not exists fiscal_nfse_empresas_grupo on fiscal_nfse_empresas (grupo_codigo);
alter table fiscal_nfse_empresas enable row level security;

create table if not exists fiscal_nfse_tomadores (
  id bigint generated always as identity primary key,
  codigoempresa int not null references fiscal_nfse_empresas(codigoempresa) on delete cascade,
  doc text,                     -- CPF/CNPJ só números (vazio = consumidor não identificado)
  nome text,
  padrao boolean not null default false,
  criado_por text, criado_em timestamptz default now()
);
create index if not exists fiscal_nfse_tomadores_emp on fiscal_nfse_tomadores (codigoempresa);
alter table fiscal_nfse_tomadores enable row level security;

alter table mei_nfse add column if not exists cancelada_em timestamptz;
alter table mei_nfse add column if not exists cancelada_por text;
alter table mei_nfse add column if not exists cancel_motivo text;
alter table mei_nfse add column if not exists cancel_xml text;
