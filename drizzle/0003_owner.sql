-- Dono da execução. Fonte ÚNICA de propriedade no schema.
--
-- Só `runs` recebe a coluna: draft_versions, judgements e published_posts já
-- referenciam runs.thread_id, então o escopo delas sai por innerJoin. Repetir o
-- dono em quatro tabelas criaria quatro lugares para divergir.
--
-- Nullable de propósito nesta migration: as linhas que já existem não têm dono
-- ainda. O NOT NULL vem no 0004, depois do backfill.
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "owner_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_owner_idx" ON "runs" ("owner_id");
