-- Fiscal › Notas Fiscais: grupos com nome (ex.: "Grupo OBDE", "Dao e Novadao") — não precisam ser
-- empresa cliente — e descrição/informação complementar própria por tomador.
create table if not exists public.fiscal_nfse_grupos (
  id bigserial primary key,
  nome text not null unique,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table public.fiscal_nfse_grupos enable row level security;
revoke all on public.fiscal_nfse_grupos from anon, authenticated;
alter table public.fiscal_nfse_empresas add column if not exists grupo_id bigint references public.fiscal_nfse_grupos(id) on delete set null;
alter table public.fiscal_nfse_tomadores add column if not exists descricao text;
alter table public.fiscal_nfse_tomadores add column if not exists info_compl text;
