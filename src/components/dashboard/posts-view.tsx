"use client";

import type { PostRow } from "@/app/api/mas/posts/route";
import { POST_SIZE_RANGES } from "@/app/MAS/constants";
import { AgentStatus } from "@/app/MAS/types/types";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Percent,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import {
  IN_PROGRESS,
  STATUS_LABEL,
  STATUS_TONE,
  avatarFor,
  formatDateTime,
  formatRelative,
} from "./_executions-shared";

const PAGE_SIZE = 8;
const GRID_COLS =
  "grid-cols-[minmax(0,1fr)_130px_110px_120px_120px]";

type TabKey = "all" | "published" | "unpublished";
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "published", label: "Publicados" },
  { key: "unpublished", label: "Não publicados" },
];

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

function PublishedBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] px-2 py-0.5 text-[11px] text-[var(--accent-green)]">
      <CheckCircle2 size={12} /> Publicado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
      <Circle size={12} /> Rascunho
    </span>
  );
}

export function PostsView() {
  const [posts, setPosts] = React.useState<PostRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<TabKey>("all");
  const [page, setPage] = React.useState(1);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/mas/posts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { posts: PostRow[] };
      setPosts(data.posts);
    } catch {
      // mantém valor anterior
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const handler = () => void load();
    window.addEventListener("mas:refresh", handler);
    window.addEventListener("mas:thread-created", handler);
    return () => {
      window.removeEventListener("mas:refresh", handler);
      window.removeEventListener("mas:thread-created", handler);
    };
  }, [load]);

  // filtros
  const filtered = posts
    .filter((p) =>
      tab === "all"
        ? true
        : tab === "published"
          ? p.published
          : !p.published,
    )
    .filter((p) =>
      search.trim()
        ? p.topic.toLowerCase().includes(search.trim().toLowerCase())
        : true,
    );

  // paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    setPage(1);
  }, [tab, search]);

  // KPIs (calculados do próprio array de posts — sem endpoint extra).
  const total = posts.length;
  const publishedCount = posts.filter((p) => p.published).length;
  const awaitingCount = posts.filter((p) => p.status === "awaiting_review").length;
  const pubRate = total > 0 ? Math.round((publishedCount / total) * 100) : 0;

  const handleDelete = async (row: PostRow) => {
    if (confirmingId !== row.threadId) {
      setConfirmingId(row.threadId);
      setTimeout(() => setConfirmingId((c) => (c === row.threadId ? null : c)), 4000);
      return;
    }
    setDeletingId(row.threadId);
    try {
      const res = await fetch(`/api/mas/threads/${row.threadId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("Falha ao deletar", { description: data.error ?? `Erro ${res.status}` });
        return;
      }
      setPosts((ps) => ps.filter((p) => p.threadId !== row.threadId));
    } catch (err) {
      toast.error("Falha ao deletar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 max-[900px]:grid-cols-2">
        <KpiCard label="Posts gerados" value={String(total)} icon={FileText} />
        <KpiCard
          label="Publicados"
          value={String(publishedCount)}
          icon={CheckCircle2}
          trend={total > 0 ? `${pubRate}% do total` : undefined}
          trendType="up"
        />
        <KpiCard
          label="Aguardando revisão"
          value={String(awaitingCount)}
          icon={Clock}
          trend={awaitingCount > 0 ? "requer ação" : undefined}
          trendType="warning"
        />
        <KpiCard
          label="Taxa de publicação"
          value={`${pubRate}%`}
          icon={Percent}
        />
      </div>

      {/* Controles: busca + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                tab === t.key
                  ? "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por tópico..."
            className="w-[240px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] py-1.5 pl-8 pr-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="min-w-[820px]">
          <div
            className={cn(
              "grid items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-2.5 text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--text-muted)]",
              GRID_COLS,
            )}
          >
            <span>Tópico</span>
            <span>Status</span>
            <span>Publicação</span>
            <span>Criado em</span>
            <span className="text-right">Ações</span>
          </div>

          {loading && posts.length === 0 ? (
            <div className="px-6 py-10 text-center text-[12px] text-[var(--text-muted)]">
              Carregando posts...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-[13px] text-[var(--text-muted)]">
              Nenhum post encontrado.
            </div>
          ) : (
            <ul>
              {pageRows.map((row) => {
                const { initials, tone } = avatarFor(row.topic);
                const isConfirming = confirmingId === row.threadId;
                const isDeleting = deletingId === row.threadId;
                return (
                  <li key={row.threadId}>
                    <div
                      className={cn(
                        "grid items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors hover:bg-[var(--bg-card-hover)]",
                        GRID_COLS,
                      )}
                    >
                      <Link
                        href={`/posts/${row.threadId}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold",
                            tone,
                          )}
                        >
                          {initials}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className="truncate text-[13px] font-medium text-[var(--text-primary)]"
                            title={row.topic}
                          >
                            {row.topic || <em className="opacity-60">sem tópico</em>}
                          </span>
                          <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                            {POST_SIZE_RANGES[row.postSize].label} · {formatRelative(row.createdAt)}
                          </span>
                        </div>
                      </Link>

                      <StatusPill status={row.status} />
                      <PublishedBadge published={row.published} />

                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {formatDateTime(row.createdAt)}
                      </span>

                      <div className="flex items-center justify-end gap-1">
                        {row.finalPostUrl && (
                          <a
                            href={row.finalPostUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver no LinkedIn"
                            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--accent-purple)] hover:bg-[var(--bg-card-hover)]"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <Link
                          href={`/posts/${row.threadId}`}
                          title="Ver post"
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                        >
                          <Eye size={14} />
                        </Link>
                        <Button
                          variant={isConfirming ? "soft" : "ghost"}
                          color={isConfirming ? "red" : undefined}
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(row)}
                          title="Deletar"
                          className="h-7 gap-1 px-2 text-[10px]"
                        >
                          <Trash2 size={12} />
                          {isConfirming ? "Confirmar?" : ""}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Paginação */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">
            {filtered.length} post{filtered.length === 1 ? "" : "s"} · página {safePage}/{totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
