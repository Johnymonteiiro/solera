"use client";

import { AgentStatus } from "@/app/MAS/types/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { STATUS_LABEL, formatRelative } from "./_executions-shared";

// Status "notáveis" que viram notificação (substituem os toasts do sonner).
const NOTABLE: AgentStatus[] = ["awaiting_review", "done", "stopped", "error"];
const POLL_MS = 5000;
const SEEN_KEY = "mas:notifications:seen";

interface ThreadRow {
  threadId: string;
  topic: string;
  status: AgentStatus;
  createdAt: string;
  completedAt: string | null;
}

interface Notification {
  id: string; // `${threadId}:${status}`
  threadId: string;
  topic: string;
  status: AgentStatus;
  at: string;
}

const STATUS_MSG: Partial<Record<AgentStatus, string>> = {
  awaiting_review: "aguardando sua revisão",
  done: "publicado com sucesso",
  stopped: "execução encerrada",
  error: "falhou",
};

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function NotificationsBell() {
  const [items, setItems] = React.useState<Notification[]>([]);
  const [seen, setSeen] = React.useState<Set<string>>(() => new Set());
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setSeen(loadSeen());
  }, []);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/mas/threads", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { threads: ThreadRow[] };
      const next = data.threads
        .filter((t) => NOTABLE.includes(t.status))
        .map<Notification>((t) => ({
          id: `${t.threadId}:${t.status}`,
          threadId: t.threadId,
          topic: t.topic,
          status: t.status,
          at: t.completedAt ?? t.createdAt,
        }))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 20);
      setItems(next);
    } catch {
      // mantém valor anterior
    }
  }, []);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    const handler = () => void load();
    window.addEventListener("mas:refresh", handler);
    window.addEventListener("mas:thread-created", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("mas:refresh", handler);
      window.removeEventListener("mas:thread-created", handler);
    };
  }, [load]);

  const unread = items.filter((i) => !seen.has(i.id));

  function markAllSeen() {
    const all = new Set(seen);
    items.forEach((i) => all.add(i.id));
    setSeen(all);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...all]));
    } catch {
      // ignora
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) markAllSeen();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label="Notificações"
        className="relative inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none"
      >
        <Bell size={16} />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-purple)] px-1 text-[9px] font-semibold text-white">
            {unread.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3.5 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            Notificações
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {items.length}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">
            Nenhuma notificação
          </div>
        ) : (
          <ul className="max-h-[360px] overflow-y-auto">
            {items.map((n) => {
              const isUnread = !seen.has(n.id);
              return (
                <li key={n.id}>
                  <Link
                    href={`/posts/${n.threadId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 border-b border-[var(--border-subtle)] px-3.5 py-2.5 transition-colors last:border-0 hover:bg-[var(--bg-card-hover)]"
                  >
                    <span
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        isUnread
                          ? "bg-[var(--accent-purple)]"
                          : "bg-transparent",
                      )}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                        {n.topic || "sem tópico"}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {STATUS_MSG[n.status] ?? STATUS_LABEL[n.status]}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        {formatRelative(n.at)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
