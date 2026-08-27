"use client";

import {
  MAX_JUDGE_RETRIES,
  MAX_REVISIONS,
  POST_SIZE_RANGES,
} from "@/app/MAS/constants";
import { HumanDecision } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Send,
  X,
  XCircle,
} from "lucide-react";
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
  const [minimized, setMinimized] = React.useState(false);

  const judgement = artifacts.judgement;
  if (!judgement || !artifacts.draft) return null;

  const isStuck = (artifacts.judgeRetries ?? 0) >= MAX_JUDGE_RETRIES;

  // Minimizado: chip discreto no canto — fechar não cancela a revisão,
  // o grafo segue pausado em interrupt até o usuário agir.
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-[var(--bg-card)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-colors hover:bg-[var(--bg-card-hover)] ${
          isStuck
            ? "border-[var(--accent-red)]/40"
            : "border-[var(--accent-amber)]/40"
        }`}
      >
        <AlertTriangle
          size={14}
          className={
            isStuck ? "text-[var(--accent-red)]" : "text-[var(--accent-amber)]"
          }
        />
        <span className="text-[12px] font-medium text-[var(--text-primary)]">
          {isStuck ? "Pipeline travado" : "Revisão pendente"}
        </span>
        <span
          className={`size-1.5 animate-pulse rounded-full ${
            isStuck ? "bg-[var(--accent-red)]" : "bg-[var(--accent-amber)]"
          }`}
        />
      </button>
    );
  }

  const submit = async (
    decision: HumanDecision,
    requireComments = false,
  ) => {
    if (requireComments && comments.trim().length === 0) {
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
          comments: requireComments ? comments.trim() : undefined,
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

  // Tokens condicionais do header — vermelho em stuck, amber no fluxo normal.
  const headerBorder = isStuck
    ? "border-[var(--accent-red)]/40"
    : "border-[var(--accent-amber)]/30";
  const headerBg = isStuck
    ? "bg-[var(--accent-red-dim)]/40"
    : "bg-[var(--accent-amber-dim)]/40";
  const headerText = isStuck
    ? "text-[var(--accent-red)]"
    : "text-[var(--accent-amber)]";
  const headerIcon = isStuck ? XCircle : AlertTriangle;
  const HeaderIcon = headerIcon;
  const headerTitle = isStuck
    ? `Pipeline travado após ${artifacts.judgeRetries} tentativas`
    : "Revisão pendente";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[640px] w-[560px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-[var(--border-active)]">
      <div
        className={`flex shrink-0 items-start justify-between gap-2 border-b ${headerBorder} ${headerBg} px-4 py-3`}
      >
        <div className="flex items-start gap-2">
          <HeaderIcon
            size={16}
            className={`mt-0.5 shrink-0 ${headerText}`}
          />
          <div className="min-w-0">
            <div className={`text-[13px] font-semibold ${headerText}`}>
              {headerTitle}
            </div>
            <div className="truncate text-[11px] text-[var(--text-secondary)]">
              {topic}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.5px] ${
                isStuck
                  ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)]"
                  : "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
              }`}
            >
              {isStuck ? "escolha uma ação" : "1 pendente"}
            </span>
            <span className="rounded-full border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              {POST_SIZE_RANGES[artifacts.postSize].label}
            </span>
          </div>
          <button
            onClick={() => setMinimized(true)}
            aria-label="Minimizar"
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-1">
        <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
          {artifacts.draft}
        </p>
      </div>

      <div className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-3">
        <div className="flex items-center justify-between pb-2">
          <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--text-muted)]">
            Estatísticas
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-muted)]">
            REV {artifacts.revisionCount}/{MAX_REVISIONS}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat
            label="SCORE GERAL"
            value={judgement.score.toFixed(1)}
            tone={scoreTone(judgement.score)}
          />
          <Stat
            label="GANCHO"
            value={judgement.hookQuality.toFixed(1)}
            tone={scoreTone(judgement.hookQuality)}
          />
          <Stat
            label="ORIGINALIDADE"
            value={judgement.originality.toFixed(1)}
            tone={scoreTone(judgement.originality)}
          />
          <Stat
            label="SCANNABILITY"
            value={judgement.scannability.toFixed(1)}
            tone={scoreTone(judgement.scannability)}
          />
          <Stat
            label="CTA"
            value={judgement.ctaQuality.toFixed(1)}
            tone={scoreTone(judgement.ctaQuality)}
          />
          <Stat
            label="TOM LINKEDIN"
            value={judgement.toneLinkedIn ? "OK" : "—"}
            tone={judgement.toneLinkedIn ? "green" : "amber"}
          />
          <Stat
            label="ENGAGEMENT BAIT"
            value={judgement.hasEngagementBait ? "⚠ DETECTADO" : "✓ LIMPO"}
            tone={judgement.hasEngagementBait ? "red" : "green"}
            small
          />
          <Stat
            label="LINK NO CORPO"
            value={judgement.hasExternalLinkInBody ? "⚠ DETECTADO" : "✓ LIMPO"}
            tone={judgement.hasExternalLinkInBody ? "red" : "green"}
            small
          />
        </div>
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

      {isStuck ? (
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
            color="amber"
            size="sm"
            onClick={() => submit("reject", true)}
            disabled={
              submitting ||
              (showRejectInput && comments.trim().length === 0) ||
              artifacts.revisionCount >= MAX_REVISIONS
            }
          >
            <RotateCcw size={12} />
            {showRejectInput ? "Enviar" : "Revisar"}
          </Button>
          <Button
            variant="soft"
            color="purple"
            size="sm"
            onClick={() => submit("restart_research")}
            disabled={submitting}
          >
            <RefreshCw size={12} />
            Refazer pesquisa
          </Button>
          <Button
            variant="soft"
            color="red"
            size="sm"
            onClick={() => submit("stop")}
            disabled={submitting}
          >
            <XCircle size={12} />
            Encerrar
          </Button>
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
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
            color="amber"
            size="sm"
            onClick={() => submit("reject", true)}
            disabled={
              submitting ||
              (showRejectInput && comments.trim().length === 0) ||
              artifacts.revisionCount >= MAX_REVISIONS
            }
          >
            <RotateCcw size={12} />
            {showRejectInput ? "Enviar" : "Revisar"}
          </Button>
          <Button
            variant="soft"
            color="red"
            size="sm"
            onClick={() => submit("stop")}
            disabled={submitting}
          >
            <XCircle size={12} />
            Cancelar
          </Button>
        </div>
      )}
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
  small = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  small?: boolean;
}) {
  const color = {
    green: "text-[var(--accent-green)]",
    amber: "text-[var(--accent-amber)]",
    red: "text-[var(--accent-red)]",
    muted: "text-[var(--text-secondary)]",
  }[tone];

  const valueClasses = small
    ? "font-mono text-[11px] tracking-[0.5px]"
    : "text-[18px]";

  return (
    <div className="rounded-md bg-[var(--bg-input)]/40 px-2 py-1.5 ring-1 ring-[var(--border-subtle)]/40">
      <div className="font-mono text-[8px] uppercase tracking-[1px] text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={`font-semibold leading-tight ${valueClasses} ${color}`}
      >
        {value}
      </div>
    </div>
  );
}
