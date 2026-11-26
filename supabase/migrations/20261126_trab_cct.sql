-- Trabalhista › Convenções Coletivas: sindicatos cadastrados e pesquisas no Mediador (MTE).
create table if not exists public.trab_sindicatos (
  id bigserial primary key,
  nome text not null,
  cnpj text,
  uf text,
  observacao text,
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists trab_sindicatos_cnpj_uk on public.trab_sindicatos (cnpj) where cnpj is not null and cnpj <> '';

create table if not exists public.trab_cct_pesquisas (
  id bigserial primary key,
  sindicato_id bigint not null references public.trab_sindicatos(id) on delete cascade,
  tipos text[] not null default '{}',
  vigencia text,                       -- '' todos | '1' vigentes | '0' não vigentes | '2' todos
  uf text,
  agendada_para date,                  -- próxima tentativa
  repetir_dias integer,                -- tentar de novo a cada N dias até achar (null = só uma vez)
  status text not null default 'pendente',   -- pendente | encontrada | nao_encontrada | cancelada
  resultado text,
  tentativas integer not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  feita_por text,
  feita_em timestamptz
);
create index if not exists trab_cct_pesquisas_status_idx on public.trab_cct_pesquisas (status, agendada_para);
alter table public.trab_sindicatos enable row level security;
alter table public.trab_cct_pesquisas enable row level security;
revoke all on public.trab_sindicatos from anon, authenticated;
revoke all on public.trab_cct_pesquisas from anon, authenticated;
