-- Fiscal › Notas Fiscais: envio da NFS-e ao Tareffa (mesmo fluxo do DARE SP).
alter table public.mei_nfse
  add column if not exists tareffa_documento_id text,
  add column if not exists tareffa_enviado_em timestamptz,
  add column if not exists tareffa_erro text;
