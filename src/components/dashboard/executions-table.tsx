"use client";

import { AgentStatus } from "@/app/MAS/types/types";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface ExecutionRow {
  threadId: string;
  topic: string;
  createdAt: string;
  status: AgentStatus;
}

interface ExecutionsTableProps {
  rows: ExecutionRow[];
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  loading?: boolean;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "aguardando",
  researching: "pesquisando",
  analyzing: "analisando",
  writing: "escrevendo",
  critiquing: "avaliando",
  awaiting_review: "revisão",
  revising: "revisando",
  publishing: "publicando",
  done: "concluído",
  error: "erro",
};

const STATUS_TONE: Record<AgentStatus, string> = {
  idle: "bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-active)]/50",
  researching:
    "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  analyzing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  writing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  critiquing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  awaiting_review:
    "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/30",
  revising:
    "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/30",
  publishing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  done: "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[var(--accent-green)]/30",
  error: "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-[var(--accent-red)]/30",
};

const IN_PROGRESS: AgentStatus[] = [
  "researching",
  "analyzing",
  "writing",
  "critiquing",
  "revising",
  "publishing",
];

function StatusPill({ status }: { status: AgentStatus }) {
  const pulsing = IN_PROGRESS.includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        STATUS_TONE[status],
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          pulsing && "animate-pulse",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function ExecutionsTable({
  rows,
  selectedId,
  onSelect,
  loading,
}: ExecutionsTableProps) {
  if (loading && rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[12px] text-[var(--text-muted)]">
        Carregando execuções...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
        <p className="text-[13px] text-[var(--text-muted)]">
          Nenhuma execução ainda
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          Clique em &ldquo;Nova publicação&rdquo; para disparar o primeiro
          pipeline
        </p>
      </div>
    );
  }

  const gridCols =
    "grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[minmax(0,1fr)_120px_110px] md:grid-cols-[minmax(0,1fr)_120px_110px_110px]";

  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          "grid items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 text-[10px] font-medium tracking-[1.5px] text-[var(--text-muted)] uppercase sm:px-5",
          gridCols,
        )}
      >
        <span>Tópico</span>
        <span>Status</span>
        <span className="hidden font-mono text-[10px] tracking-normal normal-case sm:block">
          Thread
        </span>
        <span className="hidden md:block">Criado</span>
      </div>
      <ul>
        {rows.map((row) => {
          const isSelected = row.threadId === selectedId;
          return (
            <li key={row.threadId}>
              <button
                type="button"
                onClick={() => onSelect(row.threadId)}
                className={cn(
                  "grid w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-card-hover)] sm:px-5",
                  gridCols,
                  isSelected && "bg-[var(--bg-highlight)]",
                )}
              >
                <span
                  className={cn(
                    "flex flex-col gap-0.5 min-w-0",
                    isSelected
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <span className="truncate text-[13px]" title={row.topic}>
                    {row.topic || <em className="opacity-60">sem tópico</em>}
                  </span>
                  <span className="truncate font-mono text-[10px] text-[var(--text-muted)] sm:hidden">
                    {row.threadId.replace(/^thread_/, "")} ·{" "}
                    {formatRelative(row.createdAt)}
                  </span>
                </span>
                <StatusPill status={row.status} />
                <span className="hidden truncate font-mono text-[11px] text-[var(--text-muted)] sm:block">
                  {row.threadId.replace(/^thread_/, "")}
                </span>
                <span className="hidden text-[11px] text-[var(--text-muted)] md:block">
                  {formatRelative(row.createdAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
