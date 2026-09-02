-- Tabela de permissões personalizadas por módulo/submódulo, por pessoa.
-- Usada pela tela "Usuários por setor" (T.I./Diretoria) para liberar ou
-- bloquear, individualmente, um módulo inteiro ou um app/submódulo
-- específico. Ausência de linha = "padrão do setor" (herda de lib/acesso.ts).
--
-- Rode isto no SQL Editor do Supabase do próprio Núcleo Contábil (o mesmo
-- banco onde já está a tabela ticket_users).

create table if not exists ticket_user_permissoes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  modulo_id text not null,
  -- null = override do módulo inteiro; preenchido = override de um app/submódulo específico
  app_nome text,
  nivel text not null check (nivel in ('liberado', 'bloqueado')),
  created_at timestamptz not null default now(),
  unique (email, modulo_id, app_nome)
);

create index if not exists ticket_user_permissoes_email_idx on ticket_user_permissoes (lower(email));

-- RLS: só o servidor (service role) acessa essa tabela, igual às demais de
-- tickets — o app nunca fala direto com o Supabase pelo navegador.
alter table ticket_user_permissoes enable row level security;
