-- Robô Zen — envio em lote "à prova de duplicação" (lib/robo-zen/envio-seguro.ts,
-- lib/robo-zen/job-lote-envio.ts).
--
-- O Zen não é idempotente: o mesmo documento enviado duas vezes vira dois
-- documentos. Três proteções novas precisam de apoio do banco:
--
--  1) RESERVA por documento (robo_zen_envio_reservas): antes de subir um documento
--     ao Zen, o robô grava (empresa, arquivo) aqui. A chave primária é atômica —
--     quem reserva primeiro envia, quem chega depois não envia. A reserva é apagada
--     quando o documento entra em robo_zen_envios, ou quando se tem CERTEZA de que o
--     Zen não gravou. Se um envio morre no meio sem certeza (queda de rede, função
--     que estoura o tempo), a reserva FICA: o documento aparece como "ENVIO
--     INTERROMPIDO — conferir no Zen" em vez de ser reenviado às cegas.
--
--  2) UM lote ativo por vez: índice único parcial sobre status = 'processando'.
--     Dois cliques ao mesmo tempo não criam dois lotes (a checagem das rotas não é
--     atômica; o índice é).
--
--  3) TRAVA do passo (robo_zen_lotes_envio.passo_ate): cada passo do lote toma a
--     trava com um UPDATE atômico, então vários navegadores/abas podem empurrar o
--     mesmo lote sem processar a mesma empresa em dois lugares. Vence sozinha.
--
-- É ADITIVA e idempotente (if not exists): nada existente é alterado nem apagado.
-- Aplique ANTES do merge. Sem ela o código NÃO envia nada (falha fechada, com
-- mensagem clara) — de propósito, para nunca arriscar duplicar.

-- 1) Reservas ---------------------------------------------------------------
create table if not exists public.robo_zen_envio_reservas (
  empresa_codigo text not null,
  arquivo_nome text not null,
  reservado_por text not null,            -- e-mail de quem estava enviando
  reservado_em timestamptz not null default now(),
  primary key (empresa_codigo, arquivo_nome)
);

-- Mesmo padrão das outras tabelas robo_zen_*: RLS ligada, sem política — só a
-- service role (supabaseAdmin) acessa.
alter table public.robo_zen_envio_reservas enable row level security;

comment on table public.robo_zen_envio_reservas is
  'Robô Zen: reserva atômica de um documento antes de enviá-lo ao Zen. Apagada quando o envio é registrado em robo_zen_envios ou quando é certo que o Zen não gravou; se sobrar, o envio foi interrompido sem certeza — conferir no Zen antes de reenviar.';

-- 2) Um lote ativo por vez --------------------------------------------------
create unique index if not exists robo_zen_lotes_envio_um_ativo
  on public.robo_zen_lotes_envio (status)
  where status = 'processando';

-- 3) Trava do passo ---------------------------------------------------------
alter table public.robo_zen_lotes_envio
  add column if not exists passo_ate timestamptz;

comment on column public.robo_zen_lotes_envio.passo_ate is
  'Trava do passo em andamento do lote: enquanto estiver no futuro, só quem a tomou mexe no lote. Null = livre. Vence sozinha.';
