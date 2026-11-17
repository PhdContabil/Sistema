-- Migração: Fiscal · Situação Fiscal (SITFIS via Integra Contador / SERPRO)
-- Vindo do app phd-empresas. Chave por CNPJ (a tabela empresas do Núcleo
-- não tem CNPJ estruturado). Acesso só pelo servidor (service_role).

-- ===== Cofre do escritório: certificado A1 + credenciais SERPRO (linha única) =====
create table if not exists credenciais_serpro (
  id integer primary key default 1 check (id = 1),
  consumer_key text,
  consumer_secret text,
  pfx_base64 text,
  pfx_senha text,
  cert_titular text,
  cert_cnpj text,
  cert_validade date,
  contratante_cnpj text,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table credenciais_serpro enable row level security;
-- sem policies: só service_role lê/escreve

-- ===== Situação fiscal por empresa =====
create table if not exists situacao_fiscal (
  cnpj text primary key,                -- só dígitos, 14 posições
  razao_social text,
  situacao text,                        -- regular | com_restricao | irregular | indefinida | erro
  pendencias integer,
  resumo text,
  mensagem text,
  protocolo text,
  pdf_base64 text,
  simples_opcao boolean,
  simples_inclusao date,
  simples_exclusao date,
  simples_periodos jsonb,
  simei_opcao boolean,
  simei_inclusao date,
  simei_exclusao date,
  certidao_tipo text,
  certidao_validade date,
  regra_versao smallint,
  consultado_em timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_situacao_fiscal_situacao on situacao_fiscal (situacao);
alter table situacao_fiscal enable row level security;
-- sem policies: a tela lê pela API do servidor (service_role)

-- Listagem sem o PDF (pesado), com indicador de PDF disponível.
create or replace view situacao_fiscal_lista with (security_invoker = true) as
  select cnpj, razao_social, situacao, pendencias, resumo, mensagem, consultado_em,
         simples_opcao, simples_inclusao, simples_exclusao, simples_periodos,
         simei_opcao, simei_inclusao, simei_exclusao, certidao_tipo, certidao_validade,
         regra_versao, (pdf_base64 is not null) as tem_pdf
    from situacao_fiscal;
