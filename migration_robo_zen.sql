-- Robô Zen — módulo Paralegal do Núcleo Contábil.
--
-- Porta a lógica do app Python "Robô Zen" (varredura de contratos no
-- SharePoint + cadastro no Questor Zen/Edoc via API) para rodar como
-- funções serverless na Vercel. Como uma função não aguenta processar as
-- ~770 empresas de uma vez, o trabalho é dividido em "jobs" que avançam
-- aos pedaços a cada chamada da API (ver app/api/paralegal/robo-zen/**) —
-- por isso o estado de progresso mora aqui, não em memória do processo.
--
-- Já aplicado ao projeto Supabase "system-contabilidade" (o mesmo usado
-- pelo resto do Núcleo Contábil, ver .env.local.example) via três
-- migrações (mcp__Supabase__apply_migration): "robo_zen_tabelas",
-- "robo_zen_empresa_atual" e "robo_zen_envios_pendentes_autocontido". Este
-- arquivo reúne o resultado final das três num único script idempotente
-- (create/add ... if not exists), para reproduzir do zero e para revisão
-- no PR — não precisa ser rodado de novo manualmente no banco de produção.

-- ---------------------------------------------------------------------
-- 1) Simulações (modo leitura — "Rodar simulação completa")
-- ---------------------------------------------------------------------
-- Uma linha por rodada de simulação. Duas fases, refletidas em `status`:
--   'mapeando'    -> varrendo as pastas de 1º nível de EMPRESAS atrás de
--                    empresas (equivalente a src/empresas.listar_empresas
--                    do Python), incremental, ver `pastas_mapeadas`.
--   'processando' -> para cada empresa já mapeada (linhas em
--                    robo_zen_simulacao_empresas), lista os contratos,
--                    extrai CNPJ (com OCR) e confere no Questor.
--   'concluida' | 'erro' | 'parada'
create table if not exists robo_zen_simulacoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'mapeando'
    check (status in ('mapeando', 'processando', 'concluida', 'erro', 'parada')),
  criado_por text not null,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  terminado_em timestamptz,

  -- Fase 1 (mapeamento): pastas de 1º nível de EMPRESAS_ROOT.
  pastas_raiz jsonb not null default '[]',   -- [{id, name}] — snapshot obtido no início
  pastas_mapeadas int not null default 0,

  -- Fase 2 (processamento): preenchido ao concluir o mapeamento.
  total_empresas int not null default 0,
  empresas_processadas int not null default 0,
  empresas_prontas int not null default 0,
  cursor_processamento int not null default 0,  -- acompanha empresas_processadas

  -- Nome da empresa sendo processada agora, só para a barra de progresso
  -- mostrar "processando Fulano (código 123)" durante o polling — o
  -- Python guardava isso em memória (thread rodando); aqui persistimos na
  -- linha porque cada chamada de API é uma invocação serverless nova.
  empresa_atual text,

  parar_pedido boolean not null default false,
  erro text
);

create index if not exists robo_zen_simulacoes_status_idx on robo_zen_simulacoes (status);

comment on table robo_zen_simulacoes is
  'Cabeçalho/progresso de uma rodada de simulação do Robô Zen (só leitura — nunca envia nada ao Questor). Avança aos pedaços a cada chamada de API.';

-- ---------------------------------------------------------------------
-- 2) Empresas de uma simulação (uma linha por empresa mapeada)
-- ---------------------------------------------------------------------
create table if not exists robo_zen_simulacao_empresas (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references robo_zen_simulacoes(id) on delete cascade,

  codigo text not null,
  nome text not null,
  pasta_item_id text not null,       -- id do item no Graph (pasta da empresa)
  pasta_caminho text not null,       -- caminho legível, p/ diagnóstico ("Grupo ACM/ACM Alcopla..._576")
  grupo_nome text,                   -- nome da pasta "Grupo ..." de origem, quando houver

  processada boolean not null default false,
  pronta boolean not null default false,
  motivo text,                       -- categoria curta (PRONTA, SEM_PDF, CNPJ_NAO_ENCONTRADO, ...)
  status text,                       -- mensagem completa (equivalente à coluna "status" do CSV do Python)
  cnpj text,

  qtd_documentos_elegiveis int not null default 0,
  documentos_elegiveis jsonb not null default '[]',   -- [{nome, item_id}]
  qtd_documentos_escaneados int not null default 0,
  documentos_escaneados jsonb not null default '[]',  -- [nome, ...]
  qtd_documentos_ignorados int not null default 0,
  documentos_ignorados jsonb not null default '[]',   -- [nome, ...]

  -- Guardado só quando pronta=true, para o envio em lote reaproveitar sem
  -- refazer a extração de CNPJ/OCR (equivalente a `dados_cadastro` +
  -- `caminhos_pdfs` no app.py._preparar_dados_para_envio).
  documento_cnpj_origem text,        -- nome do arquivo de onde o CNPJ foi extraído

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (simulacao_id, codigo)
);

create index if not exists robo_zen_simulacao_empresas_simulacao_idx
  on robo_zen_simulacao_empresas (simulacao_id, processada);

comment on table robo_zen_simulacao_empresas is
  'Uma linha por empresa mapeada dentro de uma simulação do Robô Zen — preenchida na fase de mapeamento e atualizada na fase de processamento.';

-- ---------------------------------------------------------------------
-- 3) Trilha de auditoria permanente dos envios REAIS ao Questor Zen
-- ---------------------------------------------------------------------
-- Nunca é apagada nem sobrescrita — equivalente ao
-- relatorios/envios_realizados.jsonl do Python. A unique (empresa_codigo,
-- arquivo_nome) é o que garante nunca duplicar um documento no Questor,
-- mesmo rodando o envio em lote várias vezes.
create table if not exists robo_zen_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_codigo text not null,
  empresa_nome text not null,
  cnpj text not null,
  arquivo_nome text not null,
  documento_id_questor text not null,
  codigo_categoria_questor text,
  codigo_cliente_questor text,
  enviado_por text not null,          -- e-mail de quem confirmou o envio (login exigido aqui; a versão Python não tinha)
  enviado_em timestamptz not null default now(),

  unique (empresa_codigo, arquivo_nome)
);

create index if not exists robo_zen_envios_empresa_idx on robo_zen_envios (empresa_codigo);

comment on table robo_zen_envios is
  'Trilha de auditoria permanente: um documento realmente cadastrado no Questor Zen (Edoc) = uma linha. Nunca apagar. A unique (empresa_codigo, arquivo_nome) evita duplicar envio.';

-- ---------------------------------------------------------------------
-- 4) Envio real em lote ("Enviar de verdade TODAS as prontas")
-- ---------------------------------------------------------------------
-- Reaproveita a lista de empresas PRONTA de uma simulação já concluída
-- (evita re-mapear/re-extrair CNPJ) — por isso referencia
-- `simulacao_origem_id` em vez de rodar tudo de novo do zero.
create table if not exists robo_zen_lotes_envio (
  id uuid primary key default gen_random_uuid(),
  simulacao_origem_id uuid not null references robo_zen_simulacoes(id),
  status text not null default 'processando'
    check (status in ('processando', 'concluida', 'erro', 'parada')),
  criado_por text not null,
  criado_em timestamptz not null default now(),
  terminado_em timestamptz,

  total_empresas_prontas int not null default 0,
  cursor_processamento int not null default 0,
  empresas_processadas int not null default 0,
  empresas_enviadas int not null default 0,       -- tiveram ao menos 1 documento novo enviado
  empresas_ja_enviadas int not null default 0,    -- já 100% enviadas antes (puladas)
  documentos_enviados int not null default 0,
  documentos_com_erro int not null default 0,
  erros jsonb not null default '[]',

  empresa_atual text,   -- mesma ideia de robo_zen_simulacoes.empresa_atual

  parar_pedido boolean not null default false,
  erro text
);

comment on table robo_zen_lotes_envio is
  'Cabeçalho/progresso do envio real em lote (todas as empresas PRONTA de uma simulação de uma vez). Avança aos pedaços a cada chamada de API; nunca duplica, ver robo_zen_envios.';

-- ---------------------------------------------------------------------
-- 5) Envio real de UMA empresa — confirmação em duas etapas
-- ---------------------------------------------------------------------
-- Etapa 1 (preparar) grava aqui o que será enviado; etapa 2 (confirmar)
-- consome o token (usado=true) e efetivamente grava no Questor. Expira
-- sozinho depois de 15 minutos (checado na consulta, não precisa de job).
--
-- Auto-contido de propósito (NÃO referencia robo_zen_simulacao_empresas):
-- este fluxo roda com dado fresco, na hora (localizarEmpresa +
-- prepararDadosParaEnvio), independente de qualquer simulação já ter sido
-- rodada antes — mesmo comportamento de `_envios_pendentes` (dict em
-- memória) no Python.
create table if not exists robo_zen_envios_pendentes (
  token uuid primary key default gen_random_uuid(),
  empresa_codigo text not null,
  empresa_nome text not null,
  cnpj text not null,
  -- [{id, nome}] — itens do Graph (SharePoint) prontos para baixar de novo
  -- no momento da confirmação (não guardamos os bytes do PDF aqui).
  documentos jsonb not null default '[]',
  criado_por text not null,
  criado_em timestamptz not null default now(),
  usado boolean not null default false
);

create index if not exists robo_zen_envios_pendentes_criado_em_idx
  on robo_zen_envios_pendentes (criado_em);

comment on table robo_zen_envios_pendentes is
  'Token de uso único (~15 min) do fluxo "preparar -> confirmar" do envio real de uma empresa por vez. Auto-contido (não depende de nenhuma simulação já ter rodado).';

-- ---------------------------------------------------------------------
-- 6) CNPJ informado manualmente (fallback, por empresa específica)
-- ---------------------------------------------------------------------
-- Algumas empresas não têm o CNPJ escrito em NENHUM documento elegível de
-- Contratos (comum em requerimentos de empresário individual, que trazem
-- só CPF/NIRE) — a busca no PDF já esgotou todas as tentativas e não achou
-- nada. Pra esses casos específicos, a Júlia pode registrar aqui o CNPJ
-- que ela já sabe de outra fonte (Questor, CRM etc.); `prepararDadosParaEnvio`
-- só consulta essa tabela DEPOIS de `extrairDadosComFallback` não achar
-- nada no PDF — nunca antes, e nunca em substituição à leitura do PDF (ver
-- lib/robo-zen/preparar-empresa.ts). Aplicada via
-- mcp__Supabase__apply_migration (migração "robo_zen_cnpj_manual").
create table if not exists robo_zen_cnpj_manual (
  codigo text primary key,           -- mesmo "código" usado no resto do Robô Zen
  cnpj text not null,
  observacao text,                   -- de onde veio, se quiser registrar (ex.: "Questor, CRM > Clientes")
  criado_por text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table robo_zen_cnpj_manual is
  'CNPJ informado manualmente por código de empresa — usado só como ÚLTIMO fallback em prepararDadosParaEnvio, depois que a busca no PDF não encontrar nada. Nunca substitui a leitura do PDF, só cobre os casos em que ela genuinamente não tem como funcionar.';

-- ---------------------------------------------------------------------
-- RLS — mesmo padrão do resto do Núcleo: só o servidor (service role)
-- acessa essas tabelas; o navegador nunca fala direto com o Supabase
-- aqui (tudo passa pelas rotas server-side em app/api/paralegal/robo-zen).
-- ---------------------------------------------------------------------
alter table robo_zen_simulacoes enable row level security;
alter table robo_zen_simulacao_empresas enable row level security;
alter table robo_zen_envios enable row level security;
alter table robo_zen_lotes_envio enable row level security;
alter table robo_zen_envios_pendentes enable row level security;
alter table robo_zen_cnpj_manual enable row level security;
