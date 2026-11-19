-- Migração: Fiscal · Parcelamentos do Simples Nacional (PARCSN, PARCSN-ESP, PERTSN, RELPSN)
-- via Integra Contador. Vindo do app phd-empresas. Controle só de quem está em parcelamento:
-- a tela lê o banco; a Receita só é consultada quando o usuário pede.

create table if not exists parcelamentos_sn (
  id bigserial primary key,
  cnpj text not null,                   -- só dígitos
  razao_social text,
  modalidade text not null,             -- PARCSN | PARCSN-ESP | PERTSN | RELPSN
  numero integer not null,              -- número do pedido (chave do OBTERPARC)
  situacao text,
  atualizado_em timestamptz not null default now(),
  unique (cnpj, modalidade, numero)
);
create index if not exists idx_parcelamentos_sn_cnpj on parcelamentos_sn (cnpj);
alter table parcelamentos_sn enable row level security;
-- sem policies: a tela lê pela API do servidor (service_role)
