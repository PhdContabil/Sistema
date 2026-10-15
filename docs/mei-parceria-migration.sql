-- Sistema MEI: modelo do contrato de parceria (Lei Salão-Parceiro) de cada profissional
-- e situação da homologação no Sindicato. Rodar no SQL Editor do Supabase (projeto system-contabilidade).
create table if not exists public.mei_parceria (
  codigoempresa    integer primary key,             -- código do MEI (profissional) no Questor
  modelo           text,                             -- modelo usado na plataforma do Sindicato
  situacao         text not null default 'Pendente', -- Pendente | Enviado | Homologado | Recusado | Não se aplica
  protocolo        text,
  data_envio       date,
  data_homologacao date,
  obs              text,
  atualizado_em    timestamptz not null default now(),
  atualizado_por   text
);
alter table public.mei_parceria enable row level security;
-- Sem políticas: só o servidor (service role) lê e grava, pela rota /api/mei/parceria.
