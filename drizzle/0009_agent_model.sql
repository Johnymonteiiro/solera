-- Modelo por agente.
--
-- Até aqui TODOS os agentes — researcher, analyst, writer e judge — liam a mesma
-- chave `LLM_MODEL`. Ou seja: o Judge avaliava, sempre, texto escrito pelo
-- próprio modelo. Para um estudo de LLM-as-judge isso é um confundimento
-- conhecido (viés de auto-preferência: modelos pontuam mais alto o próprio
-- texto), e era a limitação mais séria do desenho.
--
-- Vazio = herda `LLM_MODEL`. O default vazio é o que mantém o comportamento
-- atual para quem não configurar nada — nenhuma execução muda de modelo por
-- causa desta migration.
--
-- A procedência já cobre a mudança: `judgements.model` grava o modelo REAL de
-- cada nota, então notas feitas por juízes diferentes são separáveis no dataset.
-- Ainda assim, comparar notas de modelos diferentes dentro do MESMO corpus é
-- erro de método: ao trocar o modelo do judge, re-pontuar o corpus inteiro.
ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "model" text NOT NULL DEFAULT '';
--> statement-breakpoint

-- Semeia o modelo do Judge nas instalações que JÁ têm linha em agent_configs.
-- Sem isto, o default do código (DEFAULT_MODELS) só valeria para banco novo, e
-- este banco continuaria com o judge herdando LLM_MODEL — ou seja, o mesmo
-- modelo do writer, que é exatamente o que a migration existe para desfazer.
-- Só toca linha vazia: uma escolha já feita na tela não é sobrescrita.
UPDATE "agent_configs" SET "model" = 'gpt-4.1', "updated_at" = now()
WHERE "agent_id" = 'judge' AND "model" = '';
