-- Pessoas › Datas e Marcos: aniversários, tempo de casa, período de experiência,
-- datas comemorativas, campanhas do mês, formaturas previstas e lembretes por e-mail.
--
-- Por que tabelas novas (e não colunas em pessoas_perfil): pessoas_perfil tem a
-- política pessoas_perfil_sel (SELECT para public, using true), ou seja, qualquer
-- um com a chave pública do Supabase lê todas as colunas. Data de nascimento e de
-- admissão não podem ficar ali. Estas tabelas só são lidas pelo servidor (service
-- role): RLS ligada e sem acesso para anon/authenticated, como em trab_cct.
--
-- Os dados pessoais (nascimento, admissão, formaturas) NÃO estão nesta migração:
-- foram carregados direto no banco, para não ir parar no histórico do Git.

-- 1) Datas pessoais ---------------------------------------------------------
create table if not exists public.pessoas_datas (
  pessoa_id bigint primary key references public.pessoas_perfil(id) on delete cascade,
  data_nascimento date,
  data_admissao date,
  -- Período de experiência: 90 dias contados da admissão.
  fim_experiencia date generated always as (data_admissao + 90) stored,
  -- De onde veio a data de admissão: planilha | questor | manual.
  admissao_origem text not null default 'planilha',
  atualizado_em timestamptz not null default now()
);
create index if not exists pessoas_datas_admissao_idx on public.pessoas_datas (data_admissao);

-- 2) Formaturas previstas ---------------------------------------------------
create table if not exists public.pessoas_formaturas (
  id bigserial primary key,
  pessoa_id bigint not null references public.pessoas_perfil(id) on delete cascade,
  curso text not null,
  nivel text not null default 'Graduação',
  previsao date not null,               -- sempre o dia 1 do mês previsto (exibição: mês/ano)
  criado_em timestamptz not null default now()
);
create index if not exists pessoas_formaturas_previsao_idx on public.pessoas_formaturas (previsao);

-- 3) Datas comemorativas e campanhas ---------------------------------------
create table if not exists public.datas_comemorativas (
  id bigserial primary key,
  titulo text not null,
  -- tipo da agenda (eventos_agenda.tipo): outro | confraternizacao | bem_estar | ...
  tipo text not null default 'outro',
  -- anual: todo ano em dia/mes | segundo_domingo: 2º domingo do mês | pascoa |
  -- mes: o mês inteiro (campanha) | unica: uma data só (data_unica)
  regra text not null check (regra in ('anual', 'segundo_domingo', 'pascoa', 'mes', 'unica')),
  mes smallint check (mes between 1 and 12),
  dia smallint check (dia between 1 and 31),
  data_unica date,
  -- Cor da campanha (só regra 'mes'): o calendário do mês assume esta cor.
  cor text check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$'),
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  constraint datas_comemorativas_regra_ck check (
    (regra in ('anual') and mes is not null and dia is not null) or
    (regra in ('segundo_domingo', 'mes') and mes is not null) or
    (regra = 'pascoa') or
    (regra = 'unica' and data_unica is not null)
  )
);

-- 4) Lembretes por e-mail ---------------------------------------------------
create table if not exists public.lembretes_config (
  chave text primary key,               -- resumo_mes | tempo_casa | experiencia
  titulo text not null,
  descricao text,
  ativo boolean not null default false, -- tudo nasce desligado
  antecedencia_dias integer not null default 0,
  destinatarios text[] not null default '{}',
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

-- Um registro por lembrete enviado: impede mandar o mesmo e-mail duas vezes.
create table if not exists public.lembretes_enviados (
  chave text not null,
  referencia text not null,             -- ex.: 2026-12 (resumo), 2026-12-15 (tempo de casa)
  enviado_em timestamptz not null default now(),
  resultado text,
  primary key (chave, referencia)
);

alter table public.pessoas_datas enable row level security;
alter table public.pessoas_formaturas enable row level security;
alter table public.datas_comemorativas enable row level security;
alter table public.lembretes_config enable row level security;
alter table public.lembretes_enviados enable row level security;
revoke all on public.pessoas_datas from anon, authenticated;
revoke all on public.pessoas_formaturas from anon, authenticated;
revoke all on public.datas_comemorativas from anon, authenticated;
revoke all on public.lembretes_config from anon, authenticated;
revoke all on public.lembretes_enviados from anon, authenticated;

-- Sementes sem dado pessoal ---------------------------------------------------
insert into public.datas_comemorativas (titulo, tipo, regra, mes, dia, cor)
select * from (values
  ('Dia dos Povos Indígenas',  'outro',            'anual',           4,  19, null),
  ('Dia do Contabilista',      'outro',            'anual',           4,  25, null),
  ('Dia do Trabalhador',       'outro',            'anual',           5,   1, null),
  ('Dia da Mulher',            'outro',            'anual',           3,   8, null),
  ('Dia do Contador',          'outro',            'anual',           9,  22, null),
  ('Dia das Crianças',         'outro',            'anual',          10,  12, null),
  ('Dia da Consciência Negra', 'outro',            'anual',          11,  20, null),
  ('Dia das Mães',             'outro',            'segundo_domingo', 5, null, null),
  ('Dia dos Pais',             'outro',            'segundo_domingo', 8, null, null),
  ('Páscoa',                   'confraternizacao', 'pascoa',       null, null, null),
  ('Setembro Amarelo',         'bem_estar',        'mes',             9, null, '#eab308'),
  ('Outubro Rosa',             'bem_estar',        'mes',            10, null, '#ec4899'),
  ('Novembro Azul',            'bem_estar',        'mes',            11, null, '#2563eb')
) as v(titulo, tipo, regra, mes, dia, cor)
where not exists (select 1 from public.datas_comemorativas);

insert into public.lembretes_config (chave, titulo, descricao, ativo, antecedencia_dias, destinatarios) values
  ('resumo_mes', 'Resumo do mês',
   'Todo dia 01: aniversariantes e tempo de casa do mês.',
   false, 0, '{julia.rodrigues@phdcontabil.com.br,junior@phdcontabil.com.br}'),
  ('tempo_casa', 'Aniversário de empresa',
   'No próprio dia: quem completa tempo de casa, com destaque para 1 ano e múltiplos de 5.',
   false, 0, '{julia.rodrigues@phdcontabil.com.br,junior@phdcontabil.com.br}'),
  ('experiencia', 'Fim da experiência',
   'Antes de completar 90 dias de casa (contados da admissão no Questor).',
   false, 7, '{julia.rodrigues@phdcontabil.com.br,junior@phdcontabil.com.br}')
on conflict (chave) do nothing;
