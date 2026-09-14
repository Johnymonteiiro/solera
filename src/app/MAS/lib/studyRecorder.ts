import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { draftVersions, getDb, isDbConfigured, judgements, runs } from "@/db";
import { AgentStatus, Decision, JudgeResult, JudgeRunMeta, PostSize } from "../types/types";

/** Gate da rubrica v1 (score 0–10 ≥ 7). Só para reler a coleta antiga. */
const LEGACY_ACCEPT_SCORE = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Gravação do registro de pesquisa (append-only) no Postgres.
//
// FAIL-SOFT por desenho: este é um canal lateral do grafo. Se o banco cair, a
// execução tem que continuar — derrubar um run porque o Postgres soluçou é pior
// que perder um registro. Todo erro vira console.error bem visível e segue.
//
// Também é o que conserta o furo original: o writer grava CADA draft e o judge
// grava a nota ATRELADA àquela versão, em vez de tudo chegar só no evento
// terminal `awaiting_review` (hitl.node.ts) com o estado final.
//
// ─── Fronteira de isolamento por dono ───────────────────────────────────────
// As LEITURAS deste arquivo levam `ownerId` como primeiro parâmetro obrigatório
// e filtram por `runs.owner_id` (as tabelas do estudo não têm dono próprio: o
// escopo sai por join em runs, a fonte única de propriedade).
//
// Os ESCRITORES — `updateRunProgress`, `recordDraftVersion`, `recordJudgement` —
// ficam de fora, de propósito. São chamados de dentro dos nós do grafo, onde não
// existe request context; levar sessão até lá significaria arrastar `ownerId`
// pelo states.ts inteiro. Todos são inalcançáveis sem passar antes por
// /api/mas/run ou /api/mas/review, que checam posse. Se um dia um nó virar
// alcançável por outra entrada, esta fronteira é o que precisa ser revisto.
// ─────────────────────────────────────────────────────────────────────────────

export type DraftTrigger = "initial" | "judge_retry" | "human_revision";

function warnOnce(err: unknown, what: string): void {
  console.error(`[studyRecorder] falha ao gravar ${what} — execução continua:`, err);
}

/** Progresso do run. Não toca no histórico de versões. */
export async function updateRunProgress(
  threadId: string,
  patch: {
    status?: AgentStatus;
    revisionCount?: number;
    judgeRetries?: number;
    completedAt?: Date | null;
  },
): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const set: Record<string, unknown> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.revisionCount !== undefined) set.revisionCount = patch.revisionCount;
    if (patch.judgeRetries !== undefined) set.judgeRetries = patch.judgeRetries;
    if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;
    if (Object.keys(set).length === 0) return;
    await getDb().update(runs).set(set).where(eq(runs.threadId, threadId));
  } catch (err) {
    warnOnce(err, "progresso do run");
  }
}

/**
 * Grava um draft como versão nova. O número da versão é derivado do que já
 * existe no banco (não do state do grafo), então um replay de checkpoint não
 * sobrescreve histórico — no pior caso duplica, que é recuperável; sobrescrever
 * não é.
 *
 * @returns id da versão gravada, ou null se não gravou.
 */
export async function recordDraftVersion(input: {
  threadId: string;
  content: string;
  trigger: DraftTrigger;
}): Promise<string | null> {
  if (!isDbConfigured()) return null;
  if (!input.content?.trim()) return null;
  try {
    const db = getDb();
    const [last] = await db
      .select({ version: draftVersions.version, content: draftVersions.content })
      .from(draftVersions)
      .where(eq(draftVersions.threadId, input.threadId))
      .orderBy(desc(draftVersions.version))
      .limit(1);

    // Idempotência: o LangGraph pode reexecutar um nó ao retomar de checkpoint.
    // Draft idêntico ao último = mesma passada, não versão nova.
    if (last && last.content === input.content) return null;

    const id = randomUUID();
    await db.insert(draftVersions).values({
      id,
      threadId: input.threadId,
      version: (last?.version ?? 0) + 1,
      content: input.content,
      charCount: input.content.length,
      trigger: input.trigger,
      createdAt: new Date(),
    });
    return id;
  } catch (err) {
    warnOnce(err, "versão de draft");
    return null;
  }
}

/**
 * Atrela uma avaliação do judge à versão que ela avaliou.
 *
 * Casa pelo CONTEÚDO, não por "a última versão": se o writer falhar em gravar,
 * atrelar a nota à versão errada corromperia o par antes/depois silenciosamente
 * — exatamente a classe de erro que já custou as notas do Judge uma vez.
 */
export async function recordJudgement(input: {
  threadId: string;
  draft: string;
  judgement: JudgeResult;
  meta: JudgeRunMeta;
}): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const db = getDb();
    const [target] = await db
      .select({ id: draftVersions.id })
      .from(draftVersions)
      .where(
        and(
          eq(draftVersions.threadId, input.threadId),
          eq(draftVersions.content, input.draft),
        ),
      )
      .orderBy(desc(draftVersions.version))
      .limit(1);

    if (!target) {
      console.error(
        `[studyRecorder] nota do judge sem versão correspondente (thread=${input.threadId}, ` +
          `${input.draft.length} chars) — NÃO gravada para não corromper o par antes/depois`,
      );
      return;
    }

    const j = input.judgement;
    // Só as colunas da v2. As da v1 ficam NULL nas linhas novas — a versão do
    // instrumento viaja em `rubricVersion`, que é o que a análise filtra.
    const values = {
      clarity: j.clarity,
      relevance: j.relevance,
      professional: j.professional,
      engagement: j.engagement,
      overall: j.overall,
      decision: j.decision,
      lengthOk: j.lengthOk,
      hasEngagementBait: j.hasEngagementBait,
      hasExternalLinkInBody: j.hasExternalLinkInBody,
      issues: j.issues ?? [],
      suggestions: j.suggestions ?? [],
      // A marcação crua e o registro de correção viajam junto das notas: sem
      // eles não dá para dizer depois com que frequência o juiz contradisse o
      // próprio diagnóstico, que é resultado do estudo. Ver 0011.
      findings: j.findings ?? null,
      coherenceClamped: j.coherenceClamped ?? false,
      judgedAt: new Date(input.meta.judgedAt),
    };
    await db
      .insert(judgements)
      .values({
        id: randomUUID(),
        draftVersionId: target.id,
        ...values,
        model: input.meta.model,
        temperature: input.meta.temperature,
        rubricHash: input.meta.rubricHash,
        rubricVersion: input.meta.rubricVersion,
      })
      // Re-julgar a mesma versão (replay de checkpoint) atualiza no lugar —
      // draftVersionId é unique, então 1 nota por versão continua valendo.
      .onConflictDoUpdate({
        target: judgements.draftVersionId,
        // A PROCEDÊNCIA INTEIRA entra no UPDATE, não só as notas.
        //
        // Re-julgar acontece de verdade: replay de checkpoint, mudança de
        // instrumento (v1→v2) ou troca do modelo do Judge. Se `model`,
        // `temperature`, `rubricHash` ou `rubricVersion` ficassem de fora, a
        // linha guardaria notas novas com a procedência ANTIGA — o dataset
        // afirmaria um juiz que não produziu aquela nota, sem erro nenhum
        // aparecer. É a mesma classe de falha silenciosa que já custou todas as
        // notas do Judge uma vez.
        set: {
          ...values,
          model: input.meta.model,
          temperature: input.meta.temperature,
          rubricHash: input.meta.rubricHash,
          rubricVersion: input.meta.rubricVersion,
        },
      });
  } catch (err) {
    warnOnce(err, "nota do judge");
  }
}

// ─── Leitura do histórico de versões ─────────────────────────────────────────
//
// Só existe porque o schema é append-only: cada draft do writer virou uma linha
// e o "antes" da revisão parou de ser sobrescrito. É a matéria-prima do desenho
// antes/depois — a montagem dos pares e a seleção da amostra ficam em
// `lib/revisionPairs.ts`, que é quem os exports e a /estudo consomem.

type JudgementRow = typeof judgements.$inferSelect;

/**
 * Linha do banco → JudgeResult (o formato que UI, exports e análise usam).
 *
 * LINHAS DA v1 (score 0–10, sem as quatro dimensões): as dimensões voltam como
 * 0 — sentinela de "não avaliado neste instrumento", nunca como nota — e a
 * decisão é reconstruída pela regra que ESTAVA EM VIGOR quando aquela nota foi
 * dada (score ≥ 7). Isso não é inventar dado: é registrar o gate da época. Quem
 * separa as duas coletas é `rubricVersion`, em JudgeRunMeta.
 */
export function toJudgeResult(row: JudgementRow): JudgeResult {
  const decision: Decision =
    (row.decision as Decision | null) ??
    ((row.score ?? 0) >= LEGACY_ACCEPT_SCORE ? "ACCEPT" : "REJECT");
  return {
    clarity: row.clarity ?? 0,
    relevance: row.relevance ?? 0,
    professional: row.professional ?? 0,
    engagement: row.engagement ?? 0,
    overall: row.overall ?? 0,
    decision,
    hasEngagementBait: row.hasEngagementBait,
    hasExternalLinkInBody: row.hasExternalLinkInBody,
    lengthOk: row.lengthOk ?? row.lengthAdequate ?? false,
    issues: row.issues ?? [],
    suggestions: row.suggestions ?? [],
    // `undefined`, não `[]`: ausência de marcação (avaliação anterior ao
    // contrato ancorado) não é o mesmo que "nenhum problema marcado".
    findings: row.findings ?? undefined,
    coherenceClamped: row.coherenceClamped,
  };
}

/** Procedência da nota. Sem isto a avaliação é irreproduzível — ver JudgeRunMeta. */
export function toJudgeMeta(row: JudgementRow): JudgeRunMeta {
  return {
    model: row.model,
    temperature: row.temperature,
    rubricHash: row.rubricHash,
    rubricVersion: row.rubricVersion,
    judgedAt: row.judgedAt.toISOString(),
  };
}

/** Uma versão de draft com a nota que o judge deu ÀQUELA versão (ou null). */
export interface VersionRecord {
  id: string;
  threadId: string;
  version: number;
  content: string;
  charCount: number;
  trigger: DraftTrigger;
  createdAt: string;
  judgement: JudgeResult | null;
  judgeMeta: JudgeRunMeta | null;
}

function toVersionRecord(
  v: typeof draftVersions.$inferSelect,
  j: JudgementRow | null,
): VersionRecord {
  return {
    id: v.id,
    threadId: v.threadId,
    version: v.version,
    content: v.content,
    charCount: v.charCount,
    trigger: v.trigger as DraftTrigger,
    createdAt: v.createdAt.toISOString(),
    judgement: j ? toJudgeResult(j) : null,
    judgeMeta: j ? toJudgeMeta(j) : null,
  };
}

/** Histórico completo de um run do dono, em ordem de versão. */
export async function getVersionHistory(
  ownerId: string,
  threadId: string,
): Promise<VersionRecord[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb()
    .select({ version: draftVersions, judgement: judgements })
    .from(draftVersions)
    .innerJoin(runs, eq(runs.threadId, draftVersions.threadId))
    .leftJoin(judgements, eq(judgements.draftVersionId, draftVersions.id))
    .where(and(eq(draftVersions.threadId, threadId), eq(runs.ownerId, ownerId)))
    .orderBy(draftVersions.version);
  return rows.map((r) => toVersionRecord(r.version, r.judgement));
}

/**
 * Histórico de TODOS os runs, agrupado por threadId. Uma query só — em cima de
 * uma amostra de dezenas de execuções, um getVersionHistory por run seria N+1
 * contra o pooler do Supabase a cada abertura da /estudo.
 */
export async function getAllVersionHistories(
  ownerId: string,
): Promise<Map<string, VersionRecord[]>> {
  const byThread = new Map<string, VersionRecord[]>();
  if (!isDbConfigured()) return byThread;
  const rows = await getDb()
    .select({ version: draftVersions, judgement: judgements })
    .from(draftVersions)
    .innerJoin(runs, eq(runs.threadId, draftVersions.threadId))
    .leftJoin(judgements, eq(judgements.draftVersionId, draftVersions.id))
    .where(eq(runs.ownerId, ownerId))
    .orderBy(draftVersions.threadId, draftVersions.version);

  for (const r of rows) {
    const rec = toVersionRecord(r.version, r.judgement);
    const list = byThread.get(rec.threadId);
    if (list) list.push(rec);
    else byThread.set(rec.threadId, [rec]);
  }
  return byThread;
}

/**
 * Pares antes/depois de um run: versões CONSECUTIVAS + suas notas.
 *
 * Consecutivas, não "primeira × última": judgeRetries = N produz N+1 versões e
 * N pares, e cada par isola uma intervenção do judge. Colapsar tudo num par só
 * misturaria N críticas diferentes num delta só.
 */
export async function getRevisionPairs(
  ownerId: string,
  threadId: string,
): Promise<{ before: VersionRecord; after: VersionRecord }[]> {
  const versions = await getVersionHistory(ownerId, threadId);
  return versions
    .slice(0, -1)
    .map((before, i) => ({ before, after: versions[i + 1] }));
}

/** Contagem de versões por run — usada pelos exports e pela página /estudo. */
export async function countVersions(
  ownerId: string,
  threadId: string,
): Promise<number> {
  if (!isDbConfigured()) return 0;
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(draftVersions)
    .innerJoin(runs, eq(runs.threadId, draftVersions.threadId))
    .where(and(eq(draftVersions.threadId, threadId), eq(runs.ownerId, ownerId)));
  return row?.n ?? 0;
}

/** Metadados dos runs, sem os blobs de pesquisa (que não entram no desenho). */
export interface RunMetaRecord {
  threadId: string;
  topic: string;
  topicNorm: string;
  status: AgentStatus;
  judgeLoop: boolean;
  /** Condição do corpus: modelo que escreveu. Vazio = config global da época. */
  writerModel: string;
  revisionCount: number;
  judgeRetries: number;
  createdAt: string;
  completedAt: string | null;
  /** Descartada do estudo (não do banco) — ver runs.excludedAt no schema. */
  excludedAt: string | null;
  excludedReason: string | null;
}

export async function listRunMeta(ownerId: string): Promise<RunMetaRecord[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb()
    .select({
      threadId: runs.threadId,
      topic: runs.topic,
      topicNorm: runs.topicNorm,
      status: runs.status,
      judgeLoop: runs.judgeLoop,
      writerModel: runs.writerModel,
      revisionCount: runs.revisionCount,
      judgeRetries: runs.judgeRetries,
      createdAt: runs.createdAt,
      completedAt: runs.completedAt,
      excludedAt: runs.excludedAt,
      excludedReason: runs.excludedReason,
    })
    .from(runs)
    .where(eq(runs.ownerId, ownerId))
    .orderBy(desc(runs.createdAt));

  return rows.map((r) => ({
    ...r,
    status: r.status as AgentStatus,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    excludedAt: r.excludedAt?.toISOString() ?? null,
    excludedReason: r.excludedReason,
  }));
}

/** ENTRADAS do writer numa execução — o que o researcher/analyst produziram. */
export interface RunInputsRecord {
  threadId: string;
  topic: string;
  topicNorm: string;
  postSize: PostSize;
  /** Insights do analyst. `[]` quando a execução abortou antes de escrever. */
  insights: string[];
  createdAt: string;
}

/**
 * Lê tópico + insights por execução, para reexecutar o WRITER sem re-rodar
 * researcher e analyst.
 *
 * É o oposto deliberado de `listRunMeta`, que corta os blobs de pesquisa porque
 * eles não entram no desenho. Aqui eles SÃO o objeto: o experimento dos braços
 * (`pnpm arms`) manipula a quantidade de insights entregue ao writer, e para
 * isso os dois braços têm que partir da MESMA pesquisa. Regerá-la por braço
 * misturaria variância de busca com o efeito que se quer medir — sem contar que
 * pagaria researcher e analyst de novo a cada execução.
 */
export async function listRunInputs(ownerId: string): Promise<RunInputsRecord[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb()
    .select({
      threadId: runs.threadId,
      topic: runs.topic,
      topicNorm: runs.topicNorm,
      postSize: runs.postSize,
      insights: runs.insights,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .where(eq(runs.ownerId, ownerId))
    .orderBy(desc(runs.createdAt));

  return rows.map((r) => ({
    ...r,
    postSize: r.postSize as PostSize,
    insights: r.insights ?? [],
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Marca (ou desmarca) uma execução como descartada do estudo.
 *
 * NÃO apaga nada: drafts, notas e histórico continuam no banco e nos exports,
 * com o motivo à vista. Para remover de verdade existe `deleteThread` — que
 * cascateia e é irreversível.
 */
export async function setRunExcluded(
  ownerId: string,
  threadId: string,
  reason: string | null,
): Promise<boolean> {
  const updated = await getDb()
    .update(runs)
    .set(
      reason === null
        ? { excludedAt: null, excludedReason: null }
        : { excludedAt: new Date(), excludedReason: reason },
    )
    .where(and(eq(runs.threadId, threadId), eq(runs.ownerId, ownerId)))
    .returning({ threadId: runs.threadId });
  return updated.length > 0;
}
