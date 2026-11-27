-- Datas e Marcos: controle das lembrancinhas de tempo de casa (feita / entregue).
-- Uma linha por pessoa e por ano de casa completado. Só o service role acessa.
create table if not exists public.pessoas_lembrancinhas (
  pessoa_id bigint not null references public.pessoas_perfil(id) on delete cascade,
  anos smallint not null check (anos >= 1),
  feita_em timestamptz,
  feita_por text,
  entregue_em timestamptz,
  entregue_por text,
  primary key (pessoa_id, anos)
);

alter table public.pessoas_lembrancinhas enable row level security;
revoke all on public.pessoas_lembrancinhas from anon, authenticated;
