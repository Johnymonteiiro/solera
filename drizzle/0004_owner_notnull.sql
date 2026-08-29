-- Fecha a coluna de dono. Só depois de `pnpm db:backfill-owner <linkedinId>`.
--
-- Aplicar antes do backfill FALHA (as linhas antigas têm owner_id NULL) — e é
-- essa falha que garante que nenhuma execução fique órfã: sem dono, ela não
-- apareceria para ninguém, o que é pior que o erro.
ALTER TABLE "runs" ALTER COLUMN "owner_id" SET NOT NULL;
