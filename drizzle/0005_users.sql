-- Usuários e papéis.
--
-- Até aqui o app tinha autenticação (LinkedIn) e propriedade de dado
-- (runs.owner_id), mas nenhum registro de QUEM são as pessoas: `owner_id` era
-- uma string solta, e não havia como listar usuários para atribuir papel a eles.
-- Esta tabela é esse registro, populado no callback do OAuth a cada login.
--
-- Três papéis, do menor para o maior: user (default) < colaborador < admin.
--   user        uso normal — cria run, revisa e publica os PRÓPRIOS posts
--   colaborador + a página /estudo, os exports e o judge-repeat
--   admin       + config global (chaves, agentes, ferramentas, estudo) e papéis
--
-- O default é `user` no próprio DDL: uma conta nova nunca nasce com acesso ao
-- dado do estudo por esquecimento de código.
CREATE TABLE IF NOT EXISTS "users" (
  "linkedin_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "role" text NOT NULL DEFAULT 'user',
  "created_at" timestamp with time zone NOT NULL,
  "last_login_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");
