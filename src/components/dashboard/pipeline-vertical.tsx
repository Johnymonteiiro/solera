"use client";

import { MAX_JUDGE_RETRIES } from "@/app/MAS/constants";
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

/**
 * A aresta de volta judge → writer, com a conta das reescritas.
 *
 * O grafo tem um ciclo (`routeAfterJudge` devolve "writer" em REJECT) e a lista
 * vertical desenhava só a ida: um post aprovado de primeira e um reescrito três
 * vezes tinham o mesmo fluxo na tela, e a diferença entre os dois é o objeto do
 * estudo. Aqui o ciclo aparece — e some quando não aconteceu, porque uma seta
 * de volta permanente diria que o loop rodou sempre.
 */
function LoopConnector({
  color,
  rewrites,
  active,
}: {
  color: string;
  rewrites: number;
  active: boolean;
}) {
  const amber = "var(--accent-amber)";
  return (
    <div className="flex shrink-0 items-center gap-2 self-start">
      <svg aria-hidden width={34} height={30} className="ml-[12px] overflow-visible">
        {/* ida: writer → judge, no mesmo x dos outros conectores (12 + 16 = 28) */}
        <line
          x1="16"
          y1="0"
          x2="16"
          y2="30"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          style={{ animation: "dash-march 0.6s linear infinite" }}
        />
        {/* volta: judge → writer, contornando pela esquerda */}
        <path
          d="M16 27 C 2 27, 2 3, 16 3"
          fill="none"
          stroke={amber}
          strokeWidth="1.5"
          strokeDasharray={active ? "3 3" : undefined}
          style={active ? { animation: "dash-march 0.6s linear infinite" } : undefined}
        />
        <path
          d="M12 7 L16 2 L20 7"
          fill="none"
          stroke={amber}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.5px] text-[var(--accent-amber)]"
        title={`O judge reprovou e devolveu o draft para o writer ${rewrites}× (teto de ${MAX_JUDGE_RETRIES})`}
      >
        ↺ {rewrites}/{MAX_JUDGE_RETRIES} reescrita{rewrites > 1 ? "s" : ""}
      </span>
    </div>
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

  // Reescritas pedidas pelo JUDGE. Contadas pelo trigger das versões gravadas;
  // `judgeRetries` só entra como reserva (ele conta junto as passadas de revisão
  // humana, então diria "o judge reprovou" onde quem reprovou foi a pessoa).
  const versions = artifacts?.versions ?? [];
  const judgeRewrites = versions.length
    ? versions.filter((v) => v.trigger === "judge_retry").length
    : (artifacts?.judgeRetries ?? 0);
  // A volta está ACONTECENDO agora: o writer rodando depois de já existir nota.
  const loopRunning =
    judgeRewrites > 0 &&
    (currentStatus === "writing" || currentStatus === "revising");

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

        // A aresta que entra no judge é a única que tem volta no grafo.
        const isJudgeEdge = agent.id === "judge" && judgeRewrites > 0;

        return (
          <li key={agent.id} className="flex flex-col">
            {idx > 0 &&
              (isJudgeEdge ? (
                <LoopConnector
                  color={color}
                  rewrites={judgeRewrites}
                  active={loopRunning}
                />
              ) : (
                <Connector color={color} />
              ))}
            <VerticalNode agent={agent} state={state} artifacts={artifacts} />
          </li>
        );
      })}
    </ul>
  );
}
