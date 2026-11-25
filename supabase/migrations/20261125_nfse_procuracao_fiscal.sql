-- NFS-e por procuração também para o Fiscal: a tabela mei_nfse passa a guardar as duas origens.
alter table public.mei_nfse add column if not exists origem text not null default 'mei';
alter table public.mei_nfse add column if not exists questor_ok boolean not null default false;
alter table public.mei_nfse add column if not exists questor_erro text;
create index if not exists mei_nfse_origem_idx on public.mei_nfse (origem, criado_em desc);
