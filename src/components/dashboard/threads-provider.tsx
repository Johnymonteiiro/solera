"use client";

import { AgentStatus, PostSize } from "@/app/MAS/types/types";
import * as React from "react";

// ─── Uma única fonte de /api/mas/threads para o app inteiro ─────────────────
//
// O PROBLEMA. Três componentes buscavam esta lista por conta própria, cada um
// com `cache: "no-store"` e cada um com o SEU `setInterval` de 5s:
// `notifications-bell` (que fica na Topbar, logo em TODA página),
// `dashboard-pipeline-card` e `recent-executions-list`.
//
// Não eram três requisições — eram três a cada 5 segundos, para sempre. E cada
// uma paga, no servidor, a checagem de sessão mais a listagem de execuções.
// Medido com o banco em us-west-2: 631ms de auth + 1.555ms de listThreads.
// Três vezes isso é ~6,5s de rede por ciclo, repetido indefinidamente.
//
// Agora é UMA busca e UM intervalo, compartilhados. Os consumidores leem do
// contexto; quem precisa forçar atualização chama `refresh()` (ou dispara os
// eventos de janela de sempre, que o provider escuta em um lugar só).
//
// POR QUE CONTEXTO E NÃO PROPS: o sino vive na Topbar e os outros dois no corpo
// da página — não há pai comum a não ser o layout. Passar por props exigiria
// atravessar todas as páginas.

/** Forma mais completa das três que existiam; as outras eram subconjuntos. */
export interface ThreadRow {
  threadId: string;
  topic: string;
  postSize: PostSize;
  createdAt: string;
  completedAt: string | null;
  status: AgentStatus;
}

interface ThreadsContextValue {
  threads: ThreadRow[];
  loading: boolean;
  refresh: () => void;
}

const ThreadsContext = React.createContext<ThreadsContextValue | null>(null);

const POLL_MS = 5_000;

/**
 * Quantas execuções a janela compartilhada carrega.
 *
 * Não é o que as telas MOSTRAM — o card do dashboard mostra 5, o sino filtra
 * até 20 notáveis. É o teto do que se traz do banco a cada 5 segundos, e existe
 * porque `listThreads` é a query mais cara do app e o custo dela crescia com o
 * histórico para alimentar uma lista de cinco linhas.
 *
 * Nenhuma tela hoje precisa de mais que isso: /posts tem a própria busca em
 * `/api/mas/posts` e não depende desta janela. Se um dia alguma precisar, é
 * aqui que se mexe — ou ela pede a própria fatia com `?limit=`.
 */
export const THREADS_WINDOW = 50;

export function ThreadsProvider({
  children,
  limit = THREADS_WINDOW,
}: {
  children: React.ReactNode;
  limit?: number;
}) {
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  // Evita corrida: uma resposta lenta de um ciclo anterior não pode sobrescrever
  // a de um ciclo mais novo (acontece de verdade com latência alta).
  const emVoo = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++emVoo.current;
    try {
      const res = await fetch(`/api/mas/threads?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { threads: ThreadRow[] };
      if (id === emVoo.current) setThreads(data.threads);
    } catch {
      // mantém o valor anterior — a tela não pisca por causa de um soluço
    } finally {
      if (id === emVoo.current) setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    const handler = () => void load();
    // Os mesmos eventos que cada componente escutava por conta própria.
    window.addEventListener("mas:refresh", handler);
    window.addEventListener("mas:thread-created", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("mas:refresh", handler);
      window.removeEventListener("mas:thread-created", handler);
    };
  }, [load]);

  const value = React.useMemo(
    () => ({ threads, loading, refresh: () => void load() }),
    [threads, loading, load],
  );

  return (
    <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
  );
}

/**
 * Lista compartilhada de execuções.
 *
 * Fora do provider devolve lista vazia em vez de estourar: há telas (login,
 * páginas de erro) que montam componentes do dashboard sem o layout.
 */
export function useThreads(): ThreadsContextValue {
  return (
    React.useContext(ThreadsContext) ?? {
      threads: [],
      loading: false,
      refresh: () => {},
    }
  );
}
