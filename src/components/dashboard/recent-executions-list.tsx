"use client";

import { AgentStatus, PostSize } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import * as React from "react";
import {
  IN_PROGRESS,
  STATUS_LABEL,
  STATUS_TONE,
  avatarFor,
  formatRelative,
} from "./_executions-shared";

const POLL_MS = 5_000;

export interface ThreadSummary {
  threadId: string;
  topic: string;
  postSize: PostSize;
  createdAt: string;
  completedAt: string | null;
  status: AgentStatus;
}

type TabKey = "all" | "in_progress" | "review";

// Re-export shared helpers so existing imports (avatarFor, etc.) continue
// to work via this barrel.
export { avatarFor, formatRelative } from "./_executions-shared";

interface Props {
  // Modo controlado: se rows vier, o componente não faz fetch nem polling.
  // Útil pra páginas que já mantêm a lista (ex: ExecucoesView precisa dela
  // pra alimentar a pipeline visualization).
  rows?: ThreadSummary[];
  loading?: boolean;
  // Selection opcional — habilita o destaque de linha + callback de click.
  selectedId?: string | null;
  onSelect?: (threadId: string) => void;
}

function StatusPill({ status }: { status: AgentStatus }) {
  const pulsing = IN_PROGRESS.includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
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

function matchesTab(status: AgentStatus, tab: TabKey): boolean {
  if (tab === "all") return true;
  if (tab === "in_progress") return IN_PROGRESS.includes(status);
  if (tab === "review") return status === "awaiting_review";
  return false;
}

export function RecentExecutionsList({
  rows: rowsProp,
  loading: loadingProp,
  selectedId,
  onSelect,
}: Props = {}) {
  const controlled = rowsProp !== undefined;
  const [fetchedRows, setFetchedRows] = React.useState<ThreadSummary[]>([]);
  const [fetchedLoading, setFetchedLoading] = React.useState(true);
  const [tab, setTab] = React.useState<TabKey>("all");

  React.useEffect(() => {
    if (controlled) return; // pai gerencia rows — não buscar
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/mas/threads", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { threads: ThreadSummary[] };
        if (!cancelled) setFetchedRows(data.threads);
      } catch {
        // ignora — mantém valor anterior
      } finally {
        if (!cancelled) setFetchedLoading(false);
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const handler = () => {
      void refresh();
    };
    window.addEventListener("mas:thread-created", handler);
    window.addEventListener("mas:refresh", handler);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("mas:thread-created", handler);
      window.removeEventListener("mas:refresh", handler);
    };
  }, [controlled]);

  const rows = controlled ? rowsProp! : fetchedRows;
  const loading = controlled ? !!loadingProp : fetchedLoading;
  const filtered = rows.filter((r) => matchesTab(r.status, tab));

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-[var(--text-muted)]">
          últimas 24h
        </span>
        <div className="flex gap-0.5">
          <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
            Todas
          </TabBtn>
          <TabBtn
            active={tab === "in_progress"}
            onClick={() => setTab("in_progress")}
          >
            Em andamento
          </TabBtn>
          <TabBtn active={tab === "review"} onClick={() => setTab("review")}>
            Revisão
          </TabBtn>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-[12px] text-[var(--text-muted)]">
          Carregando execuções...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">
            {tab === "all"
              ? "Nenhuma execução ainda"
              : "Nenhuma execução neste filtro"}
          </p>
          {tab === "all" && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Clique em &ldquo;Nova publicação&rdquo; para disparar o primeiro
              pipeline
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((row) => {
            const { initials, tone } = avatarFor(row.topic);
            const isSelected = selectedId === row.threadId;
            const rowContent = (
              <div
                className={cn(
                  "flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors hover:bg-[var(--bg-card-hover)]",
                  isSelected && "bg-[var(--bg-highlight)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold",
                    tone,
                  )}
                >
                  {initials}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="truncate text-[13px] font-medium text-[var(--text-primary)]"
                    title={row.topic}
                  >
                    {row.topic || <em className="opacity-60">sem tópico</em>}
                  </span>
                  <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                    {row.threadId} · {formatRelative(row.createdAt)}
                  </span>
                </div>
                <StatusPill status={row.status} />
              </div>
            );
            return (
              <li key={row.threadId}>
                <Link
                  href={`/posts/${row.threadId}`}
                  onClick={() => onSelect?.(row.threadId)}
                  className="block w-full text-left"
                >
                  {rowContent}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "flat" : "flat-ghost"}
      size="sm"
      onClick={onClick}
      className="h-7 px-3 text-xs"
    >
      {children}
    </Button>
  );
}
