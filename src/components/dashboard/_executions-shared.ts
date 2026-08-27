// Helpers compartilhados entre RecentExecutionsList (compacto) e
// ExecutionsManagementTable (gestão) — labels, tones, avatar, formatters.

import { AgentStatus } from "@/app/MAS/types/types";

export const IN_PROGRESS: AgentStatus[] = [
  "researching",
  "analyzing",
  "writing",
  "judging",
  "revising",
  "publishing",
];

export const TERMINAL: AgentStatus[] = ["done", "stopped", "error"];

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "aguardando",
  researching: "pesquisando",
  analyzing: "analisando",
  writing: "escrevendo...",
  judging: "avaliando",
  awaiting_review: "aguardando revisão",
  revising: "revisando",
  publishing: "publicando",
  done: "publicado",
  stopped: "encerrado",
  error: "erro",
};

export const STATUS_TONE: Record<AgentStatus, string> = {
  idle: "bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-active)]/50",
  researching:
    "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  analyzing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  writing:
    "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  judging:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  awaiting_review:
    "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/30",
  revising:
    "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/30",
  publishing:
    "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30",
  done: "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[var(--accent-green)]/30",
  stopped:
    "bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-active)]/50",
  error:
    "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-[var(--accent-red)]/30",
};

const AVATAR_PALETTE = [
  "bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]",
  "bg-[var(--accent-green)]/15 text-[var(--accent-green)]",
  "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]",
  "bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]",
  "bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
];

export function avatarFor(topic: string): {
  initials: string;
  tone: string;
} {
  const cleaned = topic.trim();
  if (!cleaned) return { initials: "—", tone: AVATAR_PALETTE[0] };
  const words = cleaned.split(/\s+/).filter(Boolean);
  const initials =
    words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : (words[0][0] + words[1][0]).toUpperCase();
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = (hash * 31 + cleaned.charCodeAt(i)) >>> 0;
  }
  return { initials, tone: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] };
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

// Duração compacta entre dois ISO timestamps. Aceita null no fim → "em curso".
export function formatDuration(
  startIso: string,
  endIso: string | null,
): string {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return "—";
  const end =
    endIso === null ? Date.now() : new Date(endIso).getTime();
  if (!Number.isFinite(end)) return "—";
  const diff = Math.max(0, end - start);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

// Data + hora curta no locale pt-BR pra coluna "Criado em".
export function formatDateTime(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "—";
  return t.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
