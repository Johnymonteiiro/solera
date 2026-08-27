import { desc, eq } from "drizzle-orm";
import { draftVersions, getDb, judgements, runs } from "@/db";
import { AgentStatus, JudgeResult, JudgeRunMeta, PostSize, ResearchResult, StatusEvent } from "../types/types";
import { toJudgeMeta, toJudgeResult } from "./studyRecorder";
import { normalizeTopic } from "./topic";

// ─────────────────────────────────────────────────────────────────────────────
// Estado de execução do MAS.
//
// Duas metades, de propósito:
//   • EFÊMERA (Map em memória): eventos SSE + subscribers. Pub/sub não vai pro
//     banco — um subscriber é um callback vivo deste processo.
//   • DURÁVEL (Postgres): a linha do run. Substitui data/threads.json.
//
// `draft`, `judgement` e `judgeMeta` do ThreadSummary são **derivados** da
// última draftVersion, não colunas próprias. Era exatamente a duplicação de
// "um slot por campo" que apagava o v1 a cada reescrita do writer.
// ─────────────────────────────────────────────────────────────────────────────

interface LiveThread {
  events: StatusEvent[];
  subscribers: Set<(event: StatusEvent) => void>;
  completed: boolean;
}

export interface ThreadSummary {
  threadId: string;
  topic: string;
  postSize: PostSize;
  createdAt: string;
  completedAt: string | null;
  status: AgentStatus;
  judgeLoop: boolean;
  judgement: JudgeResult | null;
  // Procedência da avaliação (modelo, temperatura, hash do rubric). Sem isto o
  // dataset do estudo é irreproduzível — ver JudgeRunMeta.
  judgeMeta: JudgeRunMeta | null;
  draft: string | null;
  insights: string[] | null;
  researchResults: ResearchResult[] | null;
  revisionCount: number | null;
  judgeRetries: number | null;
}

// globalThis garante que o Map sobreviva ao isolamento de módulos
// do Next.js App Router entre Route Handlers diferentes.
declare global {
  // eslint-disable-next-line no-var
  var __threadLive: Map<string, LiveThread> | undefined;
}

const live = globalThis.__threadLive ?? (globalThis.__threadLive = new Map());

const TERMINAL_STATUSES: AgentStatus[] = ["done", "stopped", "error"];

function isTerminal(status: AgentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function getLive(threadId: string): LiveThread {
  let t = live.get(threadId);
  if (!t) {
    t = { events: [], subscribers: new Set(), completed: false };
    live.set(threadId, t);
  }
  return t;
}

/** Escrita em background: um erro de banco não pode derrubar o grafo. */
function fireAndForget(p: Promise<unknown>, what: string): void {
  void p.catch((err) => console.error(`[threadStore] falha ao gravar ${what}:`, err));
}

// ─── Escrita ────────────────────────────────────────────────────────────────

// Registra um thread com metadados iniciais. Deve ser chamado pelo /api/mas/run
// antes do primeiro emitEvent, para que a lista de execuções tenha topic + createdAt.
export async function createThread(
  threadId: string,
  topic: string,
  postSize: PostSize = "small",
  judgeLoop: boolean = true,
): Promise<void> {
  getLive(threadId);
  await getDb()
    .insert(runs)
    .values({
      threadId,
      topic,
      topicNorm: normalizeTopic(topic),
      postSize,
      judgeLoop,
      status: "idle",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: runs.threadId,
      set: { topic, topicNorm: normalizeTopic(topic), postSize, judgeLoop },
    });
}

// Emite um evento para um thread — salva no histórico e notifica subscribers.
// Síncrona de propósito: os nós do grafo chamam sem await, e o SSE precisa da
// entrega imediata. A gravação do status vai em background.
export function emitEvent(threadId: string, event: StatusEvent): void {
  const t = getLive(threadId);
  t.events.push(event);
  t.subscribers.forEach((sub) => sub(event));

  const patch: Record<string, unknown> = { status: event.type };
  // insights/researchResults ainda são espelhados aqui: researcher e analyst
  // rodam uma vez só, então não têm versionamento próprio. draft e judgement
  // NÃO aparecem — quem grava aqueles é o studyRecorder, por versão.
  if (event.payload?.insights != null) patch.insights = event.payload.insights;
  if (event.payload?.researchResults != null)
    patch.researchResults = event.payload.researchResults;
  if (event.payload?.revisionCount != null)
    patch.revisionCount = event.payload.revisionCount;
  if (event.payload?.judgeRetries != null)
    patch.judgeRetries = event.payload.judgeRetries;

  if (isTerminal(event.type)) {
    t.completed = true;
    t.subscribers.clear();
    patch.completedAt = new Date();
  }

  fireAndForget(
    getDb().update(runs).set(patch).where(eq(runs.threadId, threadId)),
    `evento ${event.type}`,
  );
}

// ─── Leitura ────────────────────────────────────────────────────────────────

// Subscreve a eventos de um thread (entrega histórico imediatamente + futuros)
// Retorna função de unsubscribe
export function subscribeToThread(
  threadId: string,
  onEvent: (event: StatusEvent) => void,
): () => void {
  const t = getLive(threadId);

  // Entrega eventos passados imediatamente (catch-up)
  t.events.forEach(onEvent);

  if (t.completed) return () => {};

  t.subscribers.add(onEvent);
  return () => t.subscribers.delete(onEvent);
}

type RunRow = typeof runs.$inferSelect;
type VersionRow = { content: string } | undefined;
type JudgementRow = typeof judgements.$inferSelect | undefined;

function toSummary(
  run: RunRow,
  version: VersionRow,
  judgement: JudgementRow,
): ThreadSummary {
  return {
    threadId: run.threadId,
    topic: run.topic,
    postSize: run.postSize as PostSize,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    status: run.status as AgentStatus,
    judgeLoop: run.judgeLoop,
    draft: version?.content ?? null,
    // Mapeadores vivem no studyRecorder: são a mesma tradução linha→nota que os
    // exports e a /estudo usam, e duas cópias divergiriam na próxima coluna.
    judgement: judgement ? toJudgeResult(judgement) : null,
    judgeMeta: judgement ? toJudgeMeta(judgement) : null,
    insights: run.insights ?? null,
    researchResults: (run.researchResults as ResearchResult[] | null) ?? null,
    revisionCount: run.revisionCount,
    judgeRetries: run.judgeRetries,
  };
}

// Lista todas as execuções conhecidas, mais recentes primeiro.
export async function listThreads(): Promise<ThreadSummary[]> {
  const db = getDb();
  // Uma query só: para cada run, a ÚLTIMA versão e a nota dela. DISTINCT ON é
  // do Postgres — evita o N+1 que o loop por thread daria.
  // O join tem que referenciar os campos do ALIAS (lastVersion.threadId), não
  // os da tabela base — com draftVersions.threadId o Drizzle recusa a query.
  const lastVersion = db
    .selectDistinctOn([draftVersions.threadId], {
      threadId: draftVersions.threadId,
      id: draftVersions.id,
      content: draftVersions.content,
    })
    .from(draftVersions)
    .orderBy(draftVersions.threadId, desc(draftVersions.version))
    .as("last_version");

  const rows = await db
    .select({ run: runs, content: lastVersion.content, judgement: judgements })
    .from(runs)
    .leftJoin(lastVersion, eq(runs.threadId, lastVersion.threadId))
    .leftJoin(judgements, eq(judgements.draftVersionId, lastVersion.id))
    .orderBy(desc(runs.createdAt));

  return rows.map((r) =>
    toSummary(r.run, r.content ? { content: r.content } : undefined, r.judgement ?? undefined),
  );
}

// Retorna os metadados/artefatos persistidos de um thread (ou null).
// Usado como fallback pelo /api/mas/state quando o checkpoint está vazio.
export async function getThread(
  threadId: string,
): Promise<ThreadSummary | null> {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.threadId, threadId)).limit(1);
  if (!run) return null;

  const [version] = await db
    .select({ id: draftVersions.id, content: draftVersions.content })
    .from(draftVersions)
    .where(eq(draftVersions.threadId, threadId))
    .orderBy(desc(draftVersions.version))
    .limit(1);

  let judgement: JudgementRow;
  if (version) {
    [judgement] = await db
      .select()
      .from(judgements)
      .where(eq(judgements.draftVersionId, version.id))
      .limit(1);
  }

  return toSummary(run, version, judgement);
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

// Remove a execução. As versões, notas e o post publicado caem junto por
// ON DELETE CASCADE. Limpa subscribers antes pra minimizar corrida com o grafo
// emitindo eventos pra um thread já removido.
export async function deleteThread(threadId: string): Promise<DeleteResult> {
  const t = live.get(threadId);
  if (t) {
    t.subscribers.clear();
    live.delete(threadId);
  }
  const deleted = await getDb()
    .delete(runs)
    .where(eq(runs.threadId, threadId))
    .returning({ threadId: runs.threadId });
  if (deleted.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
