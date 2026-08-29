-- Configuração sai do disco e entra no banco.
--
-- Até aqui `data/settings.json` e `data/agent-config.json` eram arquivos de
-- PROCESSO: não versionados, não auditáveis, invisíveis para quem não tem acesso
-- à máquina, e perdidos em qualquer deploy sem volume. Com multi-usuário isso
-- piorou — a `promptOverride` do agent-config muda o prompt do Judge em runtime e
-- já corrompeu todas as notas uma vez; saber QUANDO e POR QUEM mudou passou a
-- ser parte do método, não conveniência.
--
-- Três tabelas, três naturezas diferentes de config:
--   app_settings      chave/valor — credenciais e variáveis do workspace
--   agent_configs     uma linha por agente do pipeline
--   role_permissions  a matriz papel × área

-- ─── Credenciais e variáveis ────────────────────────────────────────────────
-- KV de propósito: a tela de Variáveis prevê chave nova sem migration, e um
-- schema com uma coluna por chave exigiria ALTER TABLE a cada credencial nova.
-- `is_secret` é o que decide se o valor pode voltar por GET (ver settings route).
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL DEFAULT '',
  "is_secret" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL,
  "updated_by" text
);
--> statement-breakpoint

-- ─── Config dos agentes ─────────────────────────────────────────────────────
-- `updated_by` existe por causa do hazard do promptOverride: quando uma nota do
-- Judge sair estranha, a pergunta "quem mexeu no prompt e quando" tem resposta.
CREATE TABLE IF NOT EXISTS "agent_configs" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "role" text NOT NULL DEFAULT '',
  "prompt_override" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL,
  "updated_by" text
);
--> statement-breakpoint

-- ─── Matriz de acesso ───────────────────────────────────────────────────────
-- Só `user` e `colaborador` são gravados: admin tem acesso total por definição e
-- NÃO é editável — persistir uma linha `admin/x/false` criaria um estado em que
-- ninguém alcança a própria tela de permissões.
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role" text NOT NULL,
  "area" text NOT NULL,
  "allowed" boolean NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "updated_by" text,
  PRIMARY KEY ("role", "area")
);
--> statement-breakpoint

-- Política inicial. ON CONFLICT DO NOTHING: reaplicar a migration não desfaz o
-- que um admin já ajustou na tela.
INSERT INTO "role_permissions" ("role", "area", "allowed", "updated_at") VALUES
  ('user',        'dashboard',   true,  now()),
  ('user',        'posts',       true,  now()),
  ('user',        'agentes',     false, now()),
  ('user',        'ferramentas', false, now()),
  ('user',        'analytics',   false, now()),
  ('user',        'traces',      false, now()),
  ('user',        'estudo',      false, now()),
  ('user',        'config',      false, now()),
  ('colaborador', 'dashboard',   true,  now()),
  ('colaborador', 'posts',       true,  now()),
  ('colaborador', 'agentes',     true,  now()),
  ('colaborador', 'ferramentas', false, now()),
  ('colaborador', 'analytics',   true,  now()),
  ('colaborador', 'traces',      true,  now()),
  ('colaborador', 'estudo',      true,  now()),
  ('colaborador', 'config',      false, now())
ON CONFLICT ("role", "area") DO NOTHING;
