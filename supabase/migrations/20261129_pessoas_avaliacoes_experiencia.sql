-- Datas e Marcos: avaliação do período de experiência, respondida pelo encarregado
-- por link no e-mail (token secreto, sem login). Só o service role acessa a tabela.
create table if not exists public.avaliacoes_experiencia (
  id bigserial primary key,
  pessoa_id bigint not null references public.pessoas_perfil(id) on delete cascade,
  fim_experiencia date not null,
  encarregado_email text not null,
  encarregado_nome text,
  token text not null unique,
  criado_em timestamptz not null default now(),
  -- resposta do encarregado
  enviada_em timestamptz,
  nota_desempenho smallint check (nota_desempenho between 1 and 5),
  nota_assiduidade smallint check (nota_assiduidade between 1 and 5),
  nota_equipe smallint check (nota_equipe between 1 and 5),
  nota_aprendizado smallint check (nota_aprendizado between 1 and 5),
  pontos_fortes text,
  pontos_melhorar text,
  recomendacao text check (recomendacao in ('efetivar', 'prorrogar', 'nao_efetivar')),
  justificativa text,
  -- decisão final (Junior / Julia Rodrigues)
  decisao text check (decisao in ('efetivar', 'prorrogar', 'nao_efetivar')),
  decisao_por text,
  decisao_em timestamptz,
  unique (pessoa_id, fim_experiencia, encarregado_email)
);

alter table public.avaliacoes_experiencia enable row level security;
revoke all on public.avaliacoes_experiencia from anon, authenticated;
