-- Migração: Fiscal (Apuração de Impostos, Obrigações Acessórias) e
-- Trabalhista (Folha de Pagamento, eSocial). Rodar direto no SQL Editor do
-- Supabase — cada tabela é independente, pode rodar tudo de uma vez.

-- ===== Fiscal · Apuração de Impostos =====
create table if not exists apuracao_impostos (
  id bigint generated always as identity primary key,
  empresa text not null,
  imposto text not null,           -- ICMS, PIS, COFINS, IPI, Outro
  competencia text not null,       -- "MM/AAAA"
  valor_apurado numeric(14,2),
  vencimento date,
  status text not null default 'Pendente',  -- Pendente, Pago, Atrasado
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_apuracao_impostos_competencia on apuracao_impostos (competencia);
create index if not exists idx_apuracao_impostos_status on apuracao_impostos (status);

-- ===== Fiscal · Obrigações Acessórias =====
create table if not exists obrigacoes_acessorias (
  id bigint generated always as identity primary key,
  empresa text not null,
  obrigacao text not null,         -- SPED Fiscal, EFD Contribuições, DIRF, DCTF, ECD, ECF, Outra
  competencia text not null,       -- "MM/AAAA"
  vencimento date,
  status text not null default 'Pendente',  -- Pendente, Entregue, Atrasada
  responsavel text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_obrigacoes_acessorias_competencia on obrigacoes_acessorias (competencia);
create index if not exists idx_obrigacoes_acessorias_status on obrigacoes_acessorias (status);

-- ===== Trabalhista · Folha de Pagamento =====
create table if not exists folha_pagamento (
  id bigint generated always as identity primary key,
  funcionario text not null,
  empresa text not null,
  competencia text not null,       -- "MM/AAAA"
  salario_bruto numeric(14,2) not null default 0,
  descontos numeric(14,2) not null default 0,
  salario_liquido numeric(14,2) not null default 0,
  status text not null default 'Aberta',  -- Aberta, Fechada, Paga
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_folha_pagamento_competencia on folha_pagamento (competencia);
create index if not exists idx_folha_pagamento_status on folha_pagamento (status);

-- ===== Trabalhista · eSocial =====
create table if not exists esocial_eventos (
  id bigint generated always as identity primary key,
  empresa text not null,
  tipo_evento text not null,       -- Admissão, Desligamento, Férias, Afastamento, Alteração Contratual, Outro
  competencia text not null,       -- "MM/AAAA"
  data_envio date,
  protocolo text,
  status text not null default 'Pendente',  -- Pendente, Enviado, Processado, Erro
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_esocial_eventos_competencia on esocial_eventos (competencia);
create index if not exists idx_esocial_eventos_status on esocial_eventos (status);
