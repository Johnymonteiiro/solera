import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// Registro de pesquisa do estudo Agent-as-judge.
//
// Este schema é APPEND-ONLY por desenho. O bug que motivou a migração era um
// blob com um slot por campo (`threadStore`): o judge reprovava v1, o writer
// reescrevia, e v1 — o "antes" da revisão — era sobrescrito e perdido. Aqui uma
// versão nova é uma LINHA nova; sobrescrever exigiria esforço extra.
//
// O par antes/depois do estudo = duas draftVersions consecutivas do mesmo run.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Configuração do workspace. Substitui data/settings.json e data/agent-config.json.
//
// Arquivo de processo não é config de app multi-usuário: não é auditável, some
// no deploy e é invisível para quem não tem shell na máquina. Ver 0006_config.sql.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Credenciais e variáveis do workspace, em chave/valor.
 *
 * KV e não uma coluna por chave: a tela de Variáveis prevê chave nova sem
 * migration. `isSecret` decide se o valor pode voltar num GET — quem lê é a
 * rota de settings, que redige os segredos para presença + últimos 4 dígitos.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  /** linkedinId de quem gravou. Null nas linhas semeadas pela migration. */
  updatedBy: text("updated_by"),
});

/**
 * Config por agente do pipeline (o que a tela /agentes edita).
 *
 * `updatedBy` existe por causa do hazard conhecido: `promptOverride` muda o
 * prompt do Judge em runtime e já corrompeu todas as notas uma vez. Quando uma
 * nota sair estranha, "quem mexeu e quando" precisa ter resposta.
 */
export const agentConfigs = pgTable("agent_configs", {
  agentId: text("agent_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  role: text("role").notNull().default(""),
  promptOverride: text("prompt_override").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  updatedBy: text("updated_by"),
});

/**
 * Matriz papel × área. Só `user` e `colaborador` têm linha aqui.
 *
 * `admin` NÃO é persistido de propósito: tem acesso total por definição, e uma
 * linha `admin/config/false` trancaria todo mundo para fora da própria tela de
 * permissões, sem saída pela UI.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: text("role").notNull(),
    area: text("area").notNull(),
    allowed: boolean("allowed").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.role, t.area] })],
);

/**
 * Pessoas que já logaram, e o que cada uma pode fazer.
 *
 * Populada no callback do OAuth: o LinkedIn é quem autentica, esta tabela é quem
 * AUTORIZA. A chave é o `profile.sub` — o mesmo valor de `runs.owner_id`.
 *
 * Sem FK entre `runs.owner_id` e esta tabela de propósito, por ora: as execuções
 * antigas ainda estão sem dono (backfill pendente, ver MULTIUSER-ISOLATION.md) e
 * uma FK agora criaria uma armadilha de ordem entre backfill e primeiro login.
 */
export const users = pgTable(
  "users",
  {
    linkedinId: text("linkedin_id").primaryKey(),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    /** "user" | "colaborador" | "admin" — ver ROLES em src/lib/roles.ts. */
    role: text("role").notNull().default("user"),
    /**
     * Conta desativada não loga e perde a sessão em curso — o papel é lido do
     * banco a cada requisição, então o efeito é imediato mesmo com cookie de 60
     * dias válido. É o mecanismo de "esta pessoa saiu da equipe".
     */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("users_role_idx").on(t.role), index("users_active_idx").on(t.active)],
);

/** Uma execução do grafo MAS. Espelha o que o threadStore chama de thread. */
export const runs = pgTable(
  "runs",
  {
    threadId: text("thread_id").primaryKey(),
    /**
     * Dono da execução (`profile.sub` do LinkedIn, o mesmo de Session.linkedinId).
     *
     * Fonte ÚNICA de propriedade do schema: as tabelas filhas se escopam por
     * innerJoin em runs, não por uma cópia da coluna. Ver drizzle/0003_owner.sql.
     */
    ownerId: text("owner_id").notNull(),
    topic: text("topic").notNull(),
    /** Tópico normalizado (sem acento/caixa/pontuação) — chave de pareamento. */
    topicNorm: text("topic_norm").notNull(),
    postSize: text("post_size").notNull(),
    /** false = judge pontua mas não reescreve (condição "sem judge"). */
    judgeLoop: boolean("judge_loop").notNull(),
    status: text("status").notNull(),
    /** Revisões humanas (HITL). Distinto de judgeRetries. */
    revisionCount: integer("revision_count").notNull().default(0),
    /** Reescritas disparadas pelo judge. N retries ⇒ N+1 draftVersions. */
    judgeRetries: integer("judge_retries").notNull().default(0),

    // Artefatos das etapas anteriores ao writer. Ficam no run (não versionados)
    // porque researcher e analyst rodam UMA vez — só o writer produz N versões.
    insights: jsonb("insights").$type<string[]>(),
    researchResults: jsonb("research_results").$type<unknown[]>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Descarte do ESTUDO, não do banco: a execução continua aqui com drafts e
    // notas, mas fica fora da análise. A decisão viaja com o dataset (aparece
    // nos exports) porque "o que ficou de fora e por quê" é parte do método —
    // apagar a linha destruiria a evidência e não deixaria rastro da escolha.
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    excludedReason: text("excluded_reason"),
  },
  (t) => [
    index("runs_topic_norm_idx").on(t.topicNorm),
    index("runs_owner_idx").on(t.ownerId),
  ],
);

/**
 * Posts efetivamente publicados no LinkedIn. Substitui data/published-posts.json.
 * Publicar NÃO é requisito do estudo — o publisher só roda no `approve`.
 */
export const publishedPosts = pgTable("published_posts", {
  threadId: text("thread_id")
    .primaryKey()
    .references(() => runs.threadId, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  draft: text("draft").notNull(),
  finalPostUrl: text("final_post_url").notNull(),
  language: text("language").notNull(),
  postSize: text("post_size").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
});

/**
 * Cada draft produzido pelo writer, em ordem. version começa em 1.
 * `trigger` diz POR QUE esta versão existe — é o que separa uma reescrita
 * pedida pelo judge de uma pedida por humano na hora de montar os pares.
 */
export const draftVersions = pgTable(
  "draft_versions",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => runs.threadId, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    charCount: integer("char_count").notNull(),
    /** "initial" | "judge_retry" | "human_revision" */
    trigger: text("trigger").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("draft_versions_thread_version_idx").on(t.threadId, t.version)],
);

/**
 * A avaliação do judge para UMA versão específica. 1:1 com draftVersions —
 * é o vínculo que faltava: antes a judgement flutuava solta no run e só a
 * última sobrevivia.
 */
export const judgements = pgTable(
  "judgements",
  {
    id: text("id").primaryKey(),
    draftVersionId: text("draft_version_id")
      .notNull()
      .unique()
      .references(() => draftVersions.id, { onDelete: "cascade" }),

    score: integer("score").notNull(),
    hookQuality: integer("hook_quality").notNull(),
    originality: integer("originality").notNull(),
    scannability: integer("scannability").notNull(),
    ctaQuality: integer("cta_quality").notNull(),

    lengthAdequate: boolean("length_adequate").notNull(),
    toneLinkedIn: boolean("tone_linkedin").notNull(),
    hasEngagementBait: boolean("has_engagement_bait").notNull(),
    hasExternalLinkInBody: boolean("has_external_link_in_body").notNull(),

    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    suggestions: jsonb("suggestions").$type<string[]>().notNull().default([]),

    // Procedência (JudgeRunMeta) — sem isto a nota é irreproduzível, porque o
    // rubric efetivo depende de agent-config.json, que é mutável em runtime.
    model: text("model").notNull(),
    temperature: doublePrecision("temperature").notNull(),
    rubricHash: text("rubric_hash").notNull(),
    judgedAt: timestamp("judged_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("judgements_rubric_hash_idx").on(t.rubricHash)],
);

/**
 * Avaliação humana vinda do Google Form. Uma linha por (avaliador × versão).
 * O ground truth do estudo — a comparação que não é circular.
 *
 * Fica aqui já criada porque o form é o gargalo: quando as respostas chegarem,
 * o destino existe.
 */
export const humanRatings = pgTable(
  "human_ratings",
  {
    id: text("id").primaryKey(),
    draftVersionId: text("draft_version_id")
      .notNull()
      .references(() => draftVersions.id, { onDelete: "cascade" }),
    /** Identificador anônimo do avaliador (pseudônimo do form). */
    raterId: text("rater_id").notNull(),
    /** Letra cega mostrada no form (A–F…) — o avaliador nunca vê a condição. */
    postLabel: text("post_label"),

    hookQuality: integer("hook_quality"),
    originality: integer("originality"),
    scannability: integer("scannability"),
    ctaQuality: integer("cta_quality"),
    hasEngagementBait: boolean("has_engagement_bait"),
    hasExternalLinkInBody: boolean("has_external_link_in_body"),
    /**
     * Nota holística, perguntada por ÚLTIMO e eliciada direto do avaliador.
     * Não derivar de composto: o RQ2 mede qualidade percebida, e um composto
     * com pesos escolhidos por nós tornaria a concordância circular.
     */
    overall: real("overall"),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("human_ratings_rater_version_idx").on(t.raterId, t.draftVersionId),
    index("human_ratings_version_idx").on(t.draftVersionId),
  ],
);

export const runsRelations = relations(runs, ({ many }) => ({
  versions: many(draftVersions),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one, many }) => ({
  run: one(runs, { fields: [draftVersions.threadId], references: [runs.threadId] }),
  judgement: one(judgements),
  humanRatings: many(humanRatings),
}));

export const judgementsRelations = relations(judgements, ({ one }) => ({
  draftVersion: one(draftVersions, {
    fields: [judgements.draftVersionId],
    references: [draftVersions.id],
  }),
}));

export const humanRatingsRelations = relations(humanRatings, ({ one }) => ({
  draftVersion: one(draftVersions, {
    fields: [humanRatings.draftVersionId],
    references: [draftVersions.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type AgentConfigRow = typeof agentConfigs.$inferSelect;
export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type DraftVersion = typeof draftVersions.$inferSelect;
export type Judgement = typeof judgements.$inferSelect;
export type HumanRating = typeof humanRatings.$inferSelect;
export type PublishedPostRow = typeof publishedPosts.$inferSelect;
