"use client";

import { MAX_REVISIONS, POST_SIZE_RANGES } from "@/app/MAS/constants";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Send, X } from "lucide-react";
import * as React from "react";
import { ThreadArtifacts } from "./pipeline-agents";

interface Props {
  threadId: string;
  topic: string;
  artifacts: ThreadArtifacts;
}

export function ReviewPopup({ threadId, topic, artifacts }: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [comments, setComments] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const critique = artifacts.critique;
  if (!critique || !artifacts.draft) return null;

  const submit = async (decision: "approve" | "reject") => {
    if (decision === "reject" && comments.trim().length === 0) {
      setShowRejectInput(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mas/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          decision,
          comments: decision === "reject" ? comments.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Erro ${res.status}`);
        setSubmitting(false);
      }
      // Em sucesso: deixa o SSE atualizar o status; o popup desmonta sozinho.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[600px] w-[440px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-[var(--border-active)]">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)]/40 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[var(--accent-amber)]"
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--accent-amber)]">
              Revisão pendente
            </div>
            <div className="truncate text-[11px] text-[var(--text-secondary)]">
              {topic}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-[var(--accent-amber)]/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.5px] text-[var(--accent-amber)]">
            1 pendente
          </span>
          <span className="rounded-full border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
            {POST_SIZE_RANGES[artifacts.postSize].label}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-1">
        <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
          {artifacts.draft}
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
        <Stat
          label="SCORE GERAL"
          value={critique.score.toFixed(1)}
          tone={scoreTone(critique.score)}
        />
        <Stat
          label="QUALIDADE GANCHO"
          value={critique.hookQuality.toFixed(1)}
          tone={scoreTone(critique.hookQuality)}
        />
        <Stat
          label="TOM LINKEDIN"
          value={critique.toneLinkedIn ? "OK" : "—"}
          tone={critique.toneLinkedIn ? "green" : "amber"}
        />
        <Stat
          label="REVISÕES"
          value={`${artifacts.revisionCount} / ${MAX_REVISIONS}`}
          tone="muted"
        />
      </div>

      {showRejectInput && (
        <div className="shrink-0 px-4 pb-2">
          <div className="flex items-center justify-between pb-1">
            <label className="font-mono text-[10px] uppercase text-[var(--text-muted)]">
              O que precisa mudar?
            </label>
            <button
              onClick={() => {
                setShowRejectInput(false);
                setComments("");
              }}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Sugestões específicas pro reescrever..."
            rows={3}
            disabled={submitting}
            className="w-full resize-none rounded-md bg-[var(--bg-input)] px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:ring-[var(--accent-purple)]"
          />
        </div>
      )}

      {error && (
        <div className="shrink-0 border-t border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)]/50 px-4 py-2 text-[11px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
        <Button
          variant="soft"
          color="green"
          size="sm"
          onClick={() => submit("approve")}
          disabled={submitting}
        >
          <Send size={12} />
          Publicar
        </Button>
        <Button
          variant="soft"
          color="red"
          size="sm"
          onClick={() => submit("reject")}
          disabled={
            submitting ||
            (showRejectInput && comments.trim().length === 0) ||
            artifacts.revisionCount >= MAX_REVISIONS
          }
        >
          <RotateCcw size={12} />
          {showRejectInput ? "Enviar" : "Revisar"}
        </Button>
      </div>
    </div>
  );
}

type Tone = "green" | "amber" | "red" | "muted";

function scoreTone(score: number): Tone {
  if (score >= 7) return "green";
  if (score >= 5) return "amber";
  return "red";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const color = {
    green: "text-[var(--accent-green)]",
    amber: "text-[var(--accent-amber)]",
    red: "text-[var(--accent-red)]",
    muted: "text-[var(--text-secondary)]",
  }[tone];

  return (
    <div className="rounded-md bg-[var(--bg-input)]/40 px-2 py-1.5 ring-1 ring-[var(--border-subtle)]/40">
      <div className="font-mono text-[8px] uppercase tracking-[1px] text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-[18px] font-semibold leading-tight ${color}`}>
        {value}
      </div>
    </div>
  );
}
