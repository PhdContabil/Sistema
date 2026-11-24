-- NFS-e dos MEI emitidas pelo Núcleo direto na API do Portal Nacional (certificado da PHD + procuração).
-- Controla o número da DPS por CNPJ do MEI e guarda a nota emitida (chave, número, XML).
create table if not exists public.mei_nfse (
  id bigserial primary key,
  codigoempresa integer not null,
  cnpj text not null,
  serie_dps text not null,
  ndps bigint not null,
  ambiente smallint not null,
  status text not null default 'emitindo',   -- emitindo | emitida | numero_usado | incerta
  idem text unique,
  dcompet date not null,
  valor numeric(12,2) not null,
  tomador_doc text,
  tomador_nome text,
  ctribnac text,
  descricao text,
  chave_acesso text,
  nnfse text,
  dh_proc text,
  nfse_xml text,
  dps_xml text,
  erro text,
  codigos text[],
  emitido_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cnpj, serie_dps, ndps, ambiente)
);
create index if not exists mei_nfse_cod_idx on public.mei_nfse (codigoempresa, criado_em desc);
create index if not exists mei_nfse_chave_idx on public.mei_nfse (chave_acesso);
alter table public.mei_nfse enable row level security;
revoke all on public.mei_nfse from anon, authenticated;
