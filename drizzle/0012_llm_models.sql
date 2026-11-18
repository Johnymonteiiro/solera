-- Catálogo de modelos do Writer, escolhido na tela /modelos.
--
-- Por que existe: o benchmark do estudo compara o MESMO pipeline com três
-- escritores (Claude, GPT, Gemini) nos 10 tópicos do formulário. Researcher,
-- Analyst e Critic ficam fixos; só o Writer varia. Todos passam pelo OpenRouter,
-- então o `id` é o slug dele e é essa string que vai para `runs.writer_model` —
-- o filtro por modelo da tela de estudo lê a mesma coluna.
--
-- O braço GPT do benchmark é o corpus já existente (writer_model = '', escrito
-- por gpt-4o/gpt-4o-mini via OpenAI direta). As linhas antigas NÃO são
-- reescritas: o modelo delas está nos checkpoints, e preencher a coluna agora
-- seria inventar um valor que não foi gravado na execução.
--
-- `agent_configs.writer.model` deixa de ser lido. Fica na tabela como registro
-- do que estava configurado durante o corpus (gpt-4o-mini desde 29/08 18:53).
CREATE TABLE IF NOT EXISTS "llm_models" (
  "id" text PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "updated_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "llm_models_one_default" ON "llm_models" ("is_default") WHERE "is_default";
--> statement-breakpoint
INSERT INTO "llm_models" ("id", "label", "is_default", "created_at", "updated_at") VALUES
  ('openai/gpt-4.1', 'GPT-4.1', true, now(), now()),
  ('anthropic/claude-sonnet-5', 'Claude Sonnet 5', false, now(), now()),
  ('google/gemini-3.8-flash', 'Gemini 3.8 Flash', false, now(), now())
ON CONFLICT ("id") DO NOTHING;
