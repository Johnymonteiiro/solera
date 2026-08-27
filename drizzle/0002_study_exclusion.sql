-- Descarte de execução do estudo, sem apagar dado.
--
-- Uma execução pode sair da análise por decisão do pesquisador (tópico
-- redundante, pedido mal formulado, teste), e essa decisão precisa VIAJAR COM O
-- DATASET: quem lê o CSV tem que ver o que ficou de fora e por quê. Apagar a
-- linha destruiria drafts que custaram chamada de LLM e são a única evidência
-- do comportamento do judge naquela execução.
--
-- excluded_at guarda QUANDO (procedência), não só um booleano.
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "excluded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "excluded_reason" text;
