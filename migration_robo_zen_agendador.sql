-- Robô Zen — gatilho da varredura agendada (pg_cron + pg_net, no próprio Supabase).
--
-- POR QUE AQUI: a Vercel do time está no plano Hobby, que só aceita cron de 1x
-- por dia — e uma varredura precisa de um "tick" por minuto (ver
-- lib/robo-zen/agendador.ts). O Supabase (Free) já traz agendador (pg_cron) e
-- cliente HTTP assíncrono (pg_net): o banco chama a rota
-- /api/paralegal/robo-zen/cron/varredura a cada minuto.
--
-- SEGREDO: a rota aceita um token próprio (ROBO_ZEN_VARREDURA_TOKEN) guardado em
-- app_config — a mesma tabela (só acessível pela service role) onde já ficam as
-- chaves do Microsoft Graph e do Questor. O token é gerado AQUI, dentro do banco,
-- e o job o lê dali: ele não passa por e-mail, chat, painel da Vercel nem GitHub.
--
-- NÃO É APLICADO AUTOMATICAMENTE: o merge do PR só publica o código. Este
-- arquivo é rodado uma vez, de propósito, quando for ligar a varredura (e depois
-- de trocar SEU-DOMINIO abaixo pelo endereço de produção do Núcleo).
--
-- Mesmo com o job agendado, NADA acontece até a varredura ser ligada (passo 4):
-- sem ROBO_ZEN_VARREDURA_HORAS > 0 a rota responde "desligado" e não faz mais nada.
-- A varredura é SOMENTE LEITURA: não envia nada ao Questor Zen e não mexe no SharePoint.

-- 1) Extensões (uma vez). Em alguns projetos já vêm habilitadas.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2) Token da rota (uma vez; app_config não tem chave única, então o "where not exists").
insert into public.app_config (chave, valor)
select 'ROBO_ZEN_VARREDURA_TOKEN', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.app_config where chave = 'ROBO_ZEN_VARREDURA_TOKEN');

-- 3) Job: a cada minuto chama a rota com o token (lido da própria tabela).
--    Troque SEU-DOMINIO pelo endereço de produção (ex.: nucleo.exemplo.com.br).
select cron.schedule(
  'robo-zen-varredura',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://SEU-DOMINIO/api/paralegal/robo-zen/cron/varredura',
    headers := jsonb_build_object(
      'x-cron-secret', (select valor from public.app_config where chave = 'ROBO_ZEN_VARREDURA_TOKEN')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- Limpeza do histórico do próprio pg_cron (senão cresce 1.440 linhas por dia).
select cron.schedule(
  'robo-zen-varredura-limpeza',
  '15 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $job$
);

-- 4) LIGAR a varredura: de quantas em quantas horas começa uma nova (conta do
--    INÍCIO de uma ao início da próxima). 24 = uma por dia.
insert into public.app_config (chave, valor)
select 'ROBO_ZEN_VARREDURA_HORAS', '24'
where not exists (select 1 from public.app_config where chave = 'ROBO_ZEN_VARREDURA_HORAS');

-- ---------------------------------------------------------------------------
-- Dia a dia
-- ---------------------------------------------------------------------------
-- Mudar o intervalo:   update public.app_config set valor = '12', atualizado_em = now() where chave = 'ROBO_ZEN_VARREDURA_HORAS';
-- DESLIGAR a varredura: delete from public.app_config where chave = 'ROBO_ZEN_VARREDURA_HORAS';   (ou valor '0')
-- Parar de chamar a rota de vez: select cron.unschedule('robo-zen-varredura');
-- Ver se o job está rodando:  select status, return_message, start_time from cron.job_run_details
--                              where jobid = (select jobid from cron.job where jobname = 'robo-zen-varredura') order by start_time desc limit 5;
-- Ver o que a rota respondeu: select id, status_code, left(content, 200) as resposta, created from net._http_response order by created desc limit 5;
--   (200 = tick ok; 401 = token errado/ausente; 5xx = erro dentro do tick — o motivo está no log da Vercel)
-- Trocar o token: delete from public.app_config where chave = 'ROBO_ZEN_VARREDURA_TOKEN';  e rodar o passo 2 de novo.
