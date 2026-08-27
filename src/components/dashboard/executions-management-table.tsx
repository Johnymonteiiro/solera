"use client";

import { POST_SIZE_RANGES } from "@/app/MAS/constants";
import { AgentStatus } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import {
  IN_PROGRESS,
  STATUS_LABEL,
  STATUS_TONE,
  TERMINAL,
  avatarFor,
  formatDateTime,
  formatDuration,
  formatRelative,
} from "./_executions-shared";
import { ThreadSummary } from "./recent-executions-list";

interface Props {
  rows: ThreadSummary[];
  loading: boolean;
  onDeleted: (threadId: string) => void;
}

// Grid layout das colunas — usado no header e em cada linha pra alinhamento.
// minmax(0,1fr) no tópico garante truncate funcionar.
const GRID_COLS =
  "grid-cols-[minmax(0,1fr)_140px_100px_90px_120px_72px]";

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

export function ExecutionsManagementTable({
  rows,
  loading,
  onDeleted,
}: Props) {
  // ID em estado "aguardando 2º click pra confirmar". Timeout 4s zera.
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const confirmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const handleDelete = async (row: ThreadSummary) => {
    if (!TERMINAL.includes(row.status)) return;
    if (confirmingId !== row.threadId) {
      setConfirmingId(row.threadId);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), 4_000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setDeletingId(row.threadId);
    try {
      const res = await fetch(`/api/mas/threads/${row.threadId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("Falha ao deletar execução", {
          description: data.error ?? `Erro ${res.status}`,
        });
        return;
      }
      onDeleted(row.threadId);
      toast.success("Execução deletada", {
        description: row.topic || row.threadId,
      });
    } catch (err) {
      toast.error("Falha ao deletar execução", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

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
          Nenhuma execução para gerenciar
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        {/* Header */}
        <div
          className={cn(
            "grid items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-2.5 text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--text-muted)]",
            GRID_COLS,
          )}
        >
          <span>Tópico</span>
          <span>Status</span>
          <span>Tamanho</span>
          <span>Duração</span>
          <span>Criado em</span>
          <span className="text-right">Ações</span>
        </div>

        {/* Rows */}
        <ul>
          {rows.map((row) => {
            const { initials, tone } = avatarFor(row.topic);
            const canDelete = TERMINAL.includes(row.status);
            const isConfirming = confirmingId === row.threadId;
            const isDeleting = deletingId === row.threadId;
            const sizeLabel = POST_SIZE_RANGES[row.postSize].label;

            return (
              <li key={row.threadId}>
                <div
                  className={cn(
                    "grid items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors hover:bg-[var(--bg-card-hover)]",
                    GRID_COLS,
                  )}
                >
                  {/* Tópico */}
                  <div className="flex min-w-0 items-center gap-3">
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
                        {row.topic || (
                          <em className="opacity-60">sem tópico</em>
                        )}
                      </span>
                      <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                        {row.threadId} · {formatRelative(row.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <StatusPill status={row.status} />

                  {/* Tamanho */}
                  <span className="inline-flex w-fit items-center rounded-md border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                    {sizeLabel}
                  </span>

                  {/* Duração */}
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      row.completedAt
                        ? "text-[var(--text-secondary)]"
                        : "text-[var(--accent-purple)]",
                    )}
                  >
                    {row.completedAt
                      ? formatDuration(row.createdAt, row.completedAt)
                      : "em curso"}
                  </span>

                  {/* Criado em */}
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    {formatDateTime(row.createdAt)}
                  </span>

                  {/* Ações */}
                  <div className="flex justify-end">
                    <Button
                      variant={isConfirming ? "soft" : "ghost"}
                      color={isConfirming ? "red" : undefined}
                      size="sm"
                      disabled={!canDelete || isDeleting}
                      onClick={() => handleDelete(row)}
                      title={
                        canDelete
                          ? "Deletar execução"
                          : "Aguarde a execução terminar"
                      }
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
      </div>
    </div>
  );
}
