import { and, desc, eq } from "drizzle-orm";
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
//
// ISOLAMENTO POR DONO: `ownerId` é o PRIMEIRO parâmetro, obrigatório, de toda
// leitura e de todo delete daqui. Não é estilo — é o que faz o compilador cobrar
// o escopo: um call site que eu esquecer não compila. `emitEvent` é a exceção
// deliberada (ver comentário nela).
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
//
// Retorna false quando o threadId já existe e pertence a OUTRO usuário — a
// alternativa (seguir em frente) faria o writer gravar draft_versions penduradas
// no run alheio. O chamador tem que tratar; por isso não é `void`.
export async function createThread(
  ownerId: string,
  threadId: string,
  topic: string,
  postSize: PostSize = "small",
  judgeLoop: boolean = true,
): Promise<boolean> {
  getLive(threadId);
  const [row] = await getDb()
    .insert(runs)
    .values({
      threadId,
      ownerId,
      topic,
      topicNorm: normalizeTopic(topic),
      postSize,
      judgeLoop,
      status: "idle",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: runs.threadId,
      // `ownerId` fica fora do set de propósito: dono não se reatribui por
      // reexecução. E o setWhere impede que um threadId adivinhado reescreva o
      // topic de outro — sem ele, o conflito atualizaria a linha alheia.
      set: { topic, topicNorm: normalizeTopic(topic), postSize, judgeLoop },
      setWhere: eq(runs.ownerId, ownerId),
    })
    .returning({ threadId: runs.threadId });
  return row != null;
}

// Emite um evento para um thread — salva no histórico e notifica subscribers.
// Síncrona de propósito: os nós do grafo chamam sem await, e o SSE precisa da
// entrega imediata. A gravação do status vai em background.
//
// SEM ownerId, de propósito: é chamada de dentro dos nós do grafo, onde não
// existe request context — arrastar a sessão até aqui significaria carregá-la
// pelo states.ts inteiro. Só é alcançável depois de /api/mas/run ou
// /api/mas/review, que já checaram posse. A fronteira é essa.
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
//
// Lê do Map em memória, não do banco, então escopar os stores NÃO protege esta
// função: quem chama (/api/mas/stream) tem que confirmar a posse ANTES, senão dá
// para assistir a execução alheia ao vivo.
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

// Lista as execuções DO DONO, mais recentes primeiro.
export async function listThreads(ownerId: string): Promise<ThreadSummary[]> {
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
    // Filtrar em runs basta: versões e notas pendem daqui por FK.
    .where(eq(runs.ownerId, ownerId))
    .orderBy(desc(runs.createdAt));

  return rows.map((r) =>
    toSummary(r.run, r.content ? { content: r.content } : undefined, r.judgement ?? undefined),
  );
}

// Retorna os metadados/artefatos persistidos de um thread (ou null).
// Usado como fallback pelo /api/mas/state quando o checkpoint está vazio.
export async function getThread(
  ownerId: string,
  threadId: string,
): Promise<ThreadSummary | null> {
  const db = getDb();
  // Thread de outro dono devolve null, igual a inexistente: distinguir os dois
  // casos confirmaria a existência do threadId para quem o adivinhou.
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.threadId, threadId), eq(runs.ownerId, ownerId)))
    .limit(1);
  if (!run) return null;
  // Daqui pra baixo a posse já está confirmada — as filhas podem ir por threadId.

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
export async function deleteThread(
  ownerId: string,
  threadId: string,
): Promise<DeleteResult> {
  // O delete no banco vem PRIMEIRO porque é ele que decide a posse. Limpar o Map
  // antes derrubaria os subscribers de um thread alheio ao vivo — um não-dono não
  // apagaria a linha, mas cortaria o SSE de quem está executando.
  const deleted = await getDb()
    .delete(runs)
    .where(and(eq(runs.threadId, threadId), eq(runs.ownerId, ownerId)))
    .returning({ threadId: runs.threadId });
  if (deleted.length === 0) return { ok: false, reason: "not_found" };

  const t = live.get(threadId);
  if (t) {
    t.subscribers.clear();
    live.delete(threadId);
  }
  return { ok: true };
}
