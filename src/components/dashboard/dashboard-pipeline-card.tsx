"use client";

import { AgentStatus, StatusEvent } from "@/app/MAS/types/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PipelineVertical } from "@/components/dashboard/pipeline-vertical";
import { Play } from "lucide-react";
import * as React from "react";

const POLL_MS = 5_000;
const TERMINAL: AgentStatus[] = ["done", "error"];
const IN_PROGRESS: AgentStatus[] = [
  "researching",
  "analyzing",
  "writing",
  "critiquing",
  "revising",
  "publishing",
];

interface ThreadSummary {
  threadId: string;
  topic: string;
  createdAt: string;
  status: AgentStatus;
}

export function DashboardPipelineCard() {
  const [thread, setThread] = React.useState<ThreadSummary | null>(null);
  const [liveStatus, setLiveStatus] = React.useState<AgentStatus>("idle");
  const esRef = React.useRef<EventSource | null>(null);

  const refreshThreads = React.useCallback(async () => {
    try {
      const res = await fetch("/api/mas/threads", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { threads: ThreadSummary[] };
      const running = data.threads.find((t) => IN_PROGRESS.includes(t.status));
      const next = running ?? data.threads[0] ?? null;
      setThread((prev) => {
        if (!next) return null;
        if (prev?.threadId === next.threadId) return { ...prev, ...next };
        return next;
      });
    } catch {
      // ignora erro de rede transiente
    }
  }, []);

  React.useEffect(() => {
    refreshThreads();
    const interval = setInterval(refreshThreads, POLL_MS);
    const handler = () => {
      void refreshThreads();
    };
    window.addEventListener("mas:thread-created", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("mas:thread-created", handler);
    };
  }, [refreshThreads]);

  React.useEffect(() => {
    esRef.current?.close();
    esRef.current = null;

    if (!thread) {
      setLiveStatus("idle");
      return;
    }

    setLiveStatus(thread.status);

    const es = new EventSource(`/api/mas/stream/${thread.threadId}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as StatusEvent;
        setLiveStatus(event.type);
        if (TERMINAL.includes(event.type)) {
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignora mensagem mal formada
      }
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [thread]);

  const headerBadge = thread
    ? TERMINAL.includes(liveStatus)
      ? liveStatus === "error"
        ? "falhou"
        : "finalizado"
      : "rodando"
    : "ocioso";

  return (
    <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
      <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
            Pipeline ativo
          </CardTitle>
          {thread ? (
            <p
              className="truncate text-[11px] text-[var(--text-muted)]"
              title={thread.topic || "sem tópico"}
            >
              {thread.topic || "sem tópico"}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">
              aguardando execução
            </p>
          )}
        </div>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {headerBadge}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {thread ? (
          <PipelineVertical
            currentStatus={liveStatus}
            className="max-h-[420px]"
          />
        ) : (
          <EmptyState
            icon={Play}
            title="Nenhum pipeline ativo"
            description='Clique em "Nova Publicação" para disparar'
          />
        )}
      </CardContent>
    </Card>
  );
}
