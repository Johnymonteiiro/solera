import { AgentStatus, StatusEvent } from "../types/types";

interface ThreadData {
  topic: string;
  createdAt: string;
  status: AgentStatus;
  events: StatusEvent[];
  subscribers: Set<(event: StatusEvent) => void>;
  completed: boolean;
}

export interface ThreadSummary {
  threadId: string;
  topic: string;
  createdAt: string;
  status: AgentStatus;
}

// globalThis garante que o Map sobreviva ao isolamento de módulos
// do Next.js App Router entre Route Handlers diferentes.
declare global {
  // eslint-disable-next-line no-var
  var __threadStore: Map<string, ThreadData> | undefined;
}

const threads = globalThis.__threadStore ?? (globalThis.__threadStore = new Map());

function getOrInit(threadId: string): ThreadData {
  let thread = threads.get(threadId);
  if (!thread) {
    thread = {
      topic: "",
      createdAt: new Date().toISOString(),
      status: "idle",
      events: [],
      subscribers: new Set(),
      completed: false,
    };
    threads.set(threadId, thread);
  }
  return thread;
}

// Registra um thread com metadados iniciais. Deve ser chamado pelo /api/mas/run
// antes do primeiro emitEvent, para que a lista de execuções tenha topic + createdAt.
export function createThread(threadId: string, topic: string): void {
  const thread = getOrInit(threadId);
  thread.topic = topic;
}

// Emite um evento para um thread — salva no histórico e notifica subscribers
export function emitEvent(threadId: string, event: StatusEvent): void {
  const thread = getOrInit(threadId);
  thread.events.push(event);
  thread.status = event.type;
  thread.subscribers.forEach((sub) => sub(event));
  if (event.type === "done" || event.type === "error") {
    thread.completed = true;
    thread.subscribers.clear();
  }
}

// Subscreve a eventos de um thread (entrega histórico imediatamente + futuros)
// Retorna função de unsubscribe
export function subscribeToThread(
  threadId: string,
  onEvent: (event: StatusEvent) => void,
): () => void {
  const thread = getOrInit(threadId);

  // Entrega eventos passados imediatamente (catch-up)
  thread.events.forEach(onEvent);

  if (thread.completed) return () => {};

  thread.subscribers.add(onEvent);
  return () => thread.subscribers.delete(onEvent);
}

// Lista todas as execuções conhecidas, mais recentes primeiro.
export function listThreads(): ThreadSummary[] {
  return Array.from(threads.entries())
    .map(([threadId, thread]) => ({
      threadId,
      topic: thread.topic,
      createdAt: thread.createdAt,
      status: thread.status,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
