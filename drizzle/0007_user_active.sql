-- Conta ativa/inativa + a nova área "users".
--
-- Até aqui a única forma de tirar o acesso de alguém era rebaixar para `user`
-- (que ainda entra e cria posts) ou editar ALLOWED_LINKEDIN_EMAILS no .env e
-- reiniciar o processo. Nenhuma das duas serve para "esta pessoa saiu da
-- equipe": a primeira não barra, a segunda não é operável pela UI e não derruba
-- quem já tem cookie válido de 60 dias.
--
-- `active = false` bloqueia o login E invalida a sessão em curso, porque o papel
-- é lido do banco a cada requisição (ver src/lib/dal.ts).
--
-- DEFAULT true: ninguém é desativado por uma migration.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_active_idx" ON "users" ("active");
--> statement-breakpoint

-- Área nova na matriz de acesso: a página /usuarios. Fechada para user e
-- colaborador — quem gerencia gente é admin.
INSERT INTO "role_permissions" ("role", "area", "allowed", "updated_at") VALUES
  ('user',        'users', false, now()),
  ('colaborador', 'users', false, now())
ON CONFLICT ("role", "area") DO NOTHING;
