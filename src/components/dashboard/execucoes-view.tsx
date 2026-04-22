"use client";

import { AgentStatus, StatusEvent } from "@/app/MAS/types/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutionRow, ExecutionsTable } from "./executions-table";
import { PipelineFlow } from "./pipeline-flow";
import { PipelineVertical } from "./pipeline-vertical";
import * as React from "react";

const POLL_INTERVAL_MS = 5_000;
const TERMINAL: AgentStatus[] = ["done", "error"];

interface ThreadsResponse {
  threads: ExecutionRow[];
}

export function ExecucoesView() {
  const [rows, setRows] = React.useState<ExecutionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [liveStatus, setLiveStatus] = React.useState<AgentStatus>("idle");
  const esRef = React.useRef<EventSource | null>(null);

  // Poll de /api/mas/threads
  React.useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/mas/threads", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ThreadsResponse;
        if (cancelled) return;
        setRows(data.threads);
        setSelectedId((prev) => {
          if (prev) return prev;
          return data.threads[0]?.threadId ?? null;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // SSE para o thread selecionado — atualiza liveStatus em tempo real
  React.useEffect(() => {
    esRef.current?.close();
    esRef.current = null;

    if (!selectedId) {
      setLiveStatus("idle");
      return;
    }

    const selected = rows.find((r) => r.threadId === selectedId);
    setLiveStatus(selected?.status ?? "idle");

    const es = new EventSource(`/api/mas/stream/${selectedId}`);
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
  }, [selectedId, rows]);

  const selected = rows.find((r) => r.threadId === selectedId) ?? null;
  const runningCount = rows.filter((r) => !TERMINAL.includes(r.status)).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Pipeline card */}
      <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="flex-row items-start justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Pipeline dos agentes
            </CardTitle>
            <p className="text-[11px] text-[var(--text-muted)]">
              {selected
                ? `Thread ${selected.threadId.replace(/^thread_/, "")} — ${
                    selected.topic || "sem tópico"
                  }`
                : "selecione uma execução abaixo"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[var(--accent-purple)]" />
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {runningCount > 0
                ? `${runningCount} ativo${runningCount > 1 ? "s" : ""}`
                : "ocioso"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 lg:p-2">
          <div className="hidden lg:block">
            <PipelineFlow currentStatus={liveStatus} />
          </div>
          <div className="lg:hidden">
            <PipelineVertical
              currentStatus={liveStatus}
              className="max-h-[480px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Execuções recentes
            </CardTitle>
            <p className="text-[11px] text-[var(--text-muted)]">
              {rows.length} thread{rows.length === 1 ? "" : "s"} em memória
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ExecutionsTable
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
