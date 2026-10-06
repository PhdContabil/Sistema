-- Robô Zen — "continuar de onde parou" na busca do CNPJ (lib/robo-zen/busca-parcial.ts).
--
-- A busca do CNPJ de UMA empresa tem orçamento de 40 s por chamada (a função da
-- Vercel morre aos 60 s). Empresa com vários PDFs digitalizados estourava o
-- orçamento sempre no mesmo documento e nunca chegava no que tem o CNPJ. Esta
-- tabela guarda, por empresa, os documentos já lidos sem achar CNPJ (pra próxima
-- tentativa pular esses) e o documento de onde saiu o CNPJ da última vez (pra
-- tentá-lo primeiro).
--
-- É ADITIVA e idempotente: tabela nova, nada existente é alterado. Pode ser
-- criada ANTES ou DEPOIS do merge — sem ela o código continua funcionando como
-- antes (a busca só não consegue continuar de onde parou).

create table if not exists public.robo_zen_busca_parcial (
  empresa_codigo text primary key,
  -- [{id, nome, modificado_em, problema, escaneado}] — lidos sem CNPJ
  documentos jsonb not null default '[]'::jsonb,
  -- {id, nome, modificado_em} — de onde saiu o CNPJ da última vez (ou null)
  vencedor jsonb,
  -- chamadas seguidas já gastas nesta busca (teto em MAX_PASSOS_BUSCA)
  passos integer not null default 0,
  atualizado_em timestamptz not null default now()
);

-- Mesmo padrão das outras tabelas robo_zen_*: RLS ligada, sem política — só a
-- service role (supabaseAdmin) acessa.
alter table public.robo_zen_busca_parcial enable row level security;

comment on table public.robo_zen_busca_parcial is
  'Robô Zen: progresso da busca do CNPJ por empresa (documentos já lidos sem CNPJ e documento vencedor).';
