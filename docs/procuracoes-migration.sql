-- Migração: Paralegal · Procurações (procuração eletrônica e-CAC, via
-- Integra Contador PROCURACOES/OBTERPROCURACAO41). Vindo do app phd-empresas.
-- Chave por CNPJ, como a situacao_fiscal. Acesso só pelo servidor.

create table if not exists procuracoes (
  cnpj text primary key,                -- outorgante (cliente), só dígitos
  razao_social text,
  situacao text,                        -- ativa | vencida | inexistente | erro (no momento da consulta)
  data_fim date,                        -- menor expiração entre os serviços (a mais restritiva)
  servicos jsonb,                       -- [{ dtexpiracao, sistemas[], nrsistemas }]
  mensagem text,                        -- retorno da Receita quando dá erro
  ultima_consulta timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_procuracoes_data_fim on procuracoes (data_fim);
alter table procuracoes enable row level security;
-- sem policies: a tela lê pela API do servidor (service_role)
