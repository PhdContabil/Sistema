-- Migração: Fiscal · DCTFWeb (transmissão via Integra Contador / SERPRO).
-- Vindo do app phd-empresas. Uma linha por CNPJ + competência. Acesso só
-- pelo servidor (service_role).

create table if not exists dctfweb (
  id bigserial primary key,
  cnpj text not null,                   -- só dígitos
  razao_social text,
  codigoempresa integer,                -- código no Questor
  competencia text not null,            -- 'AAAA-MM'
  obrigada boolean not null default true,
  situacao text not null default 'pendente', -- pendente | em_andamento | transmitida | erro
  tem_recibo boolean,
  recibo_numero text,
  debito numeric,                       -- do Questor: folha + reinf
  debito_folha numeric,
  debito_reinf numeric,
  origem text,                          -- eSocial / REINF CP / REINF RET / MIT (do XML da RFB)
  valor_guia numeric,                   -- saldo a pagar lido do XML da RFB
  nao_transmitir boolean not null default false, -- trava manual
  transmitida_em timestamptz,
  transmissao_erro text,
  ultima_consulta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cnpj, competencia)
);
create index if not exists idx_dctfweb_competencia on dctfweb (competencia);
alter table dctfweb enable row level security;

-- Parâmetros da transmissão automática (linha única id=1).
-- auto_transmissao nasce DESLIGADA: ligar só depois de desligar a do phd-empresas.
create table if not exists dctfweb_parametros (
  id integer primary key default 1 check (id = 1),
  dia_transmissao integer not null default 25 check (dia_transmissao between 1 and 28),
  auto_transmissao boolean not null default false,
  consultar_antes boolean not null default false,
  lote_ts timestamptz,                  -- trava da cadeia de transmissão automática
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into dctfweb_parametros (id) values (1) on conflict (id) do nothing;
alter table dctfweb_parametros enable row level security;
-- sem policies: só service_role

-- Competências distintas, da mais recente para a mais antiga (seletor da tela).
create or replace function dctfweb_competencias() returns table (competencia text)
language sql stable as $$ select distinct competencia from dctfweb order by competencia desc $$;
revoke all on function dctfweb_competencias() from public, anon, authenticated;
grant execute on function dctfweb_competencias() to service_role;

-- Rotina transmite todas (inclusive transmitidas): marca o início da rodada.
alter table dctfweb_parametros add column if not exists lote_inicio timestamptz;
