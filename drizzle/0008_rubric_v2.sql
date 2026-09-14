-- Rubrica v2: o instrumento de avaliação do Judge passa a ser o mesmo que o
-- avaliador humano responde.
--
-- Contexto (ver Evaluation-Process.md): a pergunta do estudo deixou de ser "a
-- revisão do Judge melhora o post?" e passou a ser "o Judge é um gate confiável
-- quando o humano é a referência?". Isso exige simetria — quatro dimensões
-- 1–5 com âncoras verbais, respondidas igualmente pelo juiz e pelo humano — e
-- uma regra de aceitação PRÉ-REGISTRADA (todas ≥ 3), aplicada em código dos
-- dois lados. A fonte única do instrumento é src/app/MAS/lib/rubric.ts.
--
-- POR QUE NADA É APAGADO AQUI: as colunas da v1 (score/hook/originality/
-- scannability/cta em 0–10) continuam, apenas passam a aceitar NULL. Reusar as
-- mesmas colunas para uma escala diferente misturaria 0–10 com 1–5 sem deixar
-- rastro — a mesma classe de erro que já custou as notas do Judge uma vez.
-- `rubric_version` é o que a análise filtra.

-- ─── judgements ──────────────────────────────────────────────────────────────

-- 1. As colunas da v1 param de ser obrigatórias (as linhas v2 não as preenchem).
ALTER TABLE "judgements" ALTER COLUMN "score" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "hook_quality" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "originality" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "scannability" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "cta_quality" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "length_adequate" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "judgements" ALTER COLUMN "tone_linkedin" DROP NOT NULL;
--> statement-breakpoint

-- 2. As quatro dimensões do instrumento + holística + decisão + checagem de
--    comprimento. Nullable: nenhuma linha da v1 tem como preenchê-las.
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "clarity" integer;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "relevance" integer;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "professional" integer;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "engagement" integer;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "overall" integer;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "decision" text;
--> statement-breakpoint
ALTER TABLE "judgements" ADD COLUMN IF NOT EXISTS "length_ok" boolean;
--> statement-breakpoint

-- 3. Procedência: DEFAULT 'v1' marca corretamente tudo o que já está gravado.
--    O código passa a escrever 'v2' explicitamente.
ALTER TABLE "judgements"
  ADD COLUMN IF NOT EXISTS "rubric_version" text NOT NULL DEFAULT 'v1';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judgements_rubric_version_idx"
  ON "judgements" ("rubric_version");
--> statement-breakpoint

-- ─── human_ratings ───────────────────────────────────────────────────────────
-- Espelho exato das dimensões do juiz. Sem isto, o form humano responderia um
-- instrumento e o juiz outro, e a matriz de confusão compararia coisas
-- diferentes. `overall` (holística) já existia e continua como está.

ALTER TABLE "human_ratings" ADD COLUMN IF NOT EXISTS "clarity" integer;
--> statement-breakpoint
ALTER TABLE "human_ratings" ADD COLUMN IF NOT EXISTS "relevance" integer;
--> statement-breakpoint
ALTER TABLE "human_ratings" ADD COLUMN IF NOT EXISTS "professional" integer;
--> statement-breakpoint
ALTER TABLE "human_ratings" ADD COLUMN IF NOT EXISTS "engagement" integer;
--> statement-breakpoint

-- DEFAULT 'v2' aqui, ao contrário de judgements: a tabela está VAZIA (o form
-- ainda não foi a campo), então toda linha futura nasce no instrumento novo.
ALTER TABLE "human_ratings"
  ADD COLUMN IF NOT EXISTS "rubric_version" text NOT NULL DEFAULT 'v2';
