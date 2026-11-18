-- Letra do formulário humano, GRAVADA na execução.
--
-- Por que existe: até aqui a letra saía da POSIÇÃO na fila do corpus
-- (studyCorpus.ts). Em 2026-09-17 os 15 posts que não foram ao formulário
-- saíram do banco, e a fila dos 10 restantes renumeraria as letras
-- (C→B, J→H, P→J…). As respostas do Forms (study/data/form-responses.xlsx) e o
-- artigo citam os posts pela letra — J, L e P são os escritos pelo gpt-4o-mini.
-- Gravar a letra desliga o cálculo por posição para estas execuções.
--
-- Fonte das letras: study/data/critic-scores.csv (10 posts, na ordem do form).
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "form_label" text;
--> statement-breakpoint
UPDATE "runs" AS r SET "form_label" = v.label
FROM (VALUES
  ('thread_4bd69195', 'A'),
  ('thread_5b68fe54', 'J'),
  ('thread_79b0ac3d', 'D'),
  ('thread_c0c50f18', 'L'),
  ('thread_0081350f', 'F'),
  ('thread_d9e5d2e2', 'P'),
  ('thread_7d493545', 'I'),
  ('thread_d747a769', 'E'),
  ('thread_d1389092', 'H'),
  ('thread_5d76e9f5', 'C')
) AS v(thread_id, label)
WHERE r."thread_id" = v.thread_id;
