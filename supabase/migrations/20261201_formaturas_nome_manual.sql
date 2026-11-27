-- Formaturas: além de um colaborador cadastrado, aceita um nome digitado à mão.
alter table public.pessoas_formaturas alter column pessoa_id drop not null;
alter table public.pessoas_formaturas add column if not exists nome_manual text;
alter table public.pessoas_formaturas drop constraint if exists pessoas_formaturas_pessoa_ou_nome_ck;
alter table public.pessoas_formaturas add constraint pessoas_formaturas_pessoa_ou_nome_ck
  check (pessoa_id is not null or (nome_manual is not null and length(trim(nome_manual)) > 0));
