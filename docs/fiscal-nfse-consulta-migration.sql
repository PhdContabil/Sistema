-- Fiscal › Notas Fiscais › Consultar notas: empresas cadastradas para captura
-- (as notas NÃO são guardadas: são lidas do Portal Nacional na hora).
create table if not exists public.fiscal_nfse_consulta_empresas (
  codigoempresa integer primary key,
  nome text not null,
  cnpj text not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table public.fiscal_nfse_consulta_empresas enable row level security;
