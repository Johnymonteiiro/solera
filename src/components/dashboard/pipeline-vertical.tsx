"use client";

import { AgentStatus } from "@/app/MAS/types/types";
import { AgentArtifactButton } from "@/components/dashboard/agent-artifact-button";
import {
  AGENTS,
  AgentDef,
  NodeState,
  ThreadArtifacts,
  badgeLabel,
  computeNodeState,
} from "@/components/dashboard/pipeline-agents";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const CARD_CLASSES: Record<NodeState, string> = {
  active: "border-transparent bg-[var(--accent-purple-dim)]",
  done: "border-transparent bg-[var(--bg-card)]",
  pending: "border-[var(--border-active)] bg-[var(--bg-card)]",
  skeleton:
    "border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)]/40",
  error: "border-[var(--accent-red)]/60 bg-[var(--accent-red-dim)]",
  stopped: "border-[var(--text-muted)]/40 bg-[var(--bg-input)]/60",
};

const ICON_WRAP_CLASSES: Record<NodeState, string> = {
  active: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]",
  done: "bg-[var(--bg-input)] text-[var(--text-secondary)]",
  pending: "bg-[var(--bg-input)] text-[var(--text-secondary)]",
  skeleton: "bg-[var(--bg-input)]/50 text-[var(--text-muted)]",
  error: "bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
  stopped: "bg-[var(--bg-input)] text-[var(--text-muted)]",
};

const TITLE_CLASSES: Record<NodeState, string> = {
  active: "text-[var(--text-primary)]",
  done: "text-[var(--text-primary)]",
  pending: "text-[var(--text-secondary)]",
  skeleton: "text-[var(--text-muted)]",
  error: "text-[var(--accent-red)]",
  stopped: "text-[var(--text-muted)] line-through",
};

const BADGE_CLASSES: Record<NodeState, string> = {
  active:
    "border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]",
  done: "border-[var(--accent-green)]/40 bg-transparent text-[var(--accent-green)]",
  pending:
    "border-[var(--border-active)]/60 bg-[var(--bg-input)] text-[var(--text-muted)]",
  skeleton:
    "border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)]",
  error:
    "border-[var(--accent-red)]/40 bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
  stopped:
    "border-[var(--text-muted)]/40 bg-[var(--bg-input)] text-[var(--text-muted)]",
};

interface VerticalNodeProps {
  agent: AgentDef;
  state: NodeState;
  artifacts: ThreadArtifacts | null;
}

function VerticalNode({ agent, state, artifacts }: VerticalNodeProps) {
  const Icon = agent.icon;
  const isActive = state === "active";
  const isDone = state === "done";

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-colors",
        CARD_CLASSES[state],
      )}
    >
      {(isActive || isDone) && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="12"
            ry="12"
            fill="none"
            stroke={
              isActive ? "var(--accent-purple)" : "var(--accent-green)"
            }
            strokeWidth="1"
            strokeDasharray="3 3"
            style={{ animation: "dash-march 0.6s linear infinite" }}
          />
        </svg>
      )}
      <div
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-lg",
          ICON_WRAP_CLASSES[state],
        )}
      >
        {isActive && (
          <span className="absolute inset-0 animate-ping rounded-lg bg-[var(--accent-purple)]/30" />
        )}
        <Icon size={16} strokeWidth={1.75} className="relative" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-[12.5px] font-medium",
            TITLE_CLASSES[state],
          )}
        >
          {agent.label}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
          {agent.id}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[1px]",
            BADGE_CLASSES[state],
          )}
        >
          {isDone && <Check size={9} strokeWidth={3} />}
          {badgeLabel(agent, state)}
        </span>
        <AgentArtifactButton
          agent={agent}
          state={state}
          artifacts={artifacts}
        />
      </div>
    </div>
  );
}

interface ConnectorProps {
  color: string;
}

function Connector({ color }: ConnectorProps) {
  return (
    <svg
      aria-hidden
      width={2}
      height={14}
      className="ml-[28px] self-start shrink-0"
    >
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="14"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        style={{ animation: "dash-march 0.6s linear infinite" }}
      />
    </svg>
  );
}

interface Props {
  currentStatus: AgentStatus;
  artifacts?: ThreadArtifacts | null;
  errorAgentIdx?: number | null;
  className?: string;
}

export function PipelineVertical({
  currentStatus,
  artifacts = null,
  errorAgentIdx = null,
  className,
}: Props) {
  const isError = currentStatus === "error";
  const stoppedReason = artifacts?.stoppedReason ?? null;

  return (
    <ul
      className={cn(
        "relative flex flex-col gap-1 overflow-y-auto px-4 py-3 pr-3",
        className,
      )}
    >
      {AGENTS.map((agent, idx) => {
        const state = computeNodeState(
          agent,
          currentStatus,
          errorAgentIdx,
          stoppedReason,
        );
        const prevState =
          idx > 0
            ? computeNodeState(
                AGENTS[idx - 1],
                currentStatus,
                errorAgentIdx,
                stoppedReason,
              )
            : null;
        const isActiveEdge = prevState !== null && state === "active";
        const isErrorEdge =
          isError &&
          errorAgentIdx !== null &&
          idx === errorAgentIdx &&
          prevState !== null;
        const isDoneEdge = prevState === "done";

        let color = "var(--border-active)";
        if (isErrorEdge) color = "var(--accent-red)";
        else if (isActiveEdge) color = "var(--accent-purple)";
        else if (isDoneEdge) color = "var(--accent-green)";

        return (
          <li key={agent.id} className="flex flex-col">
            {idx > 0 && <Connector color={color} />}
            <VerticalNode agent={agent} state={state} artifacts={artifacts} />
          </li>
        );
      })}
    </ul>
  );
}
