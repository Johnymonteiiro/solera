"use client";

import { AgentStatus } from "@/app/MAS/types/types";
import {
  AGENTS,
  AgentDef,
  NodeState,
  ThreadArtifacts,
  badgeLabel,
  computeNodeState,
} from "@/components/dashboard/pipeline-agents";
import { cn } from "@/lib/utils";
import {
  Background,
  BackgroundVariant,
  Edge,
  Handle,
  Node,
  NodeProps,
  NodeTypes,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Check } from "lucide-react";
import * as React from "react";
import { AgentArtifactButton } from "./agent-artifact-button";

const NODE_W = 124;
const NODE_GAP = 40;
const NODE_Y = 20;

const CARD_CLASSES: Record<NodeState, string> = {
  active:
    "border-transparent bg-[var(--accent-purple-dim)] text-[var(--text-primary)]",
  done: "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)]",
  pending:
    "border-[var(--border-active)] bg-[var(--bg-card)] text-[var(--text-secondary)]",
  skeleton:
    "border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)]/40 text-[var(--text-muted)]",
  error:
    "border-[var(--accent-red)]/60 bg-[var(--accent-red-dim)] text-[var(--accent-red)]",
};

const ICON_WRAP_CLASSES: Record<NodeState, string> = {
  active: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]",
  done: "bg-[var(--bg-input)] text-[var(--text-secondary)]",
  pending: "bg-[var(--bg-input)] text-[var(--text-secondary)]",
  skeleton: "bg-[var(--bg-input)]/50 text-[var(--text-muted)]",
  error: "bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
};

const BADGE_CLASSES: Record<NodeState, string> = {
  active:
    "border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]",
  done: "border border-[var(--accent-green)]/40 bg-transparent text-[var(--accent-green)]",
  pending:
    "border border-[var(--border-active)]/60 bg-[var(--bg-input)] text-[var(--text-muted)]",
  skeleton:
    "border border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)]",
  error:
    "border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
};

interface AgentNodeData extends Record<string, unknown> {
  agent: AgentDef;
  state: NodeState;
  artifacts: ThreadArtifacts | null;
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, state, artifacts } = data;
  const Icon = agent.icon;
  const isActive = state === "active";
  const isDone = state === "done";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.25)] transition-colors",
        CARD_CLASSES[state],
      )}
      style={{ width: NODE_W }}
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
            stroke={isActive ? "var(--accent-purple)" : "var(--accent-green)"}
            strokeWidth="1"
            strokeDasharray="3 3"
            style={{ animation: "dash-march 0.6s linear infinite" }}
          />
        </svg>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-[var(--border-active)]"
      />
      <div
        className={cn(
          "relative flex size-8 items-center justify-center rounded-lg",
          ICON_WRAP_CLASSES[state],
        )}
      >
        {isActive && (
          <span className="absolute inset-0 animate-ping rounded-lg bg-[var(--accent-purple)]/30" />
        )}
        <Icon size={16} strokeWidth={1.75} className="relative" />
      </div>
      <span className="text-[12px] font-medium">{agent.label}</span>
      <div className="flex flex-col gap-1 z-100 nodrag">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full p-1 font-mono text-[6px] uppercase tracking-[1px]",
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
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-[var(--border-active)]"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = { agent: AgentNode };

function buildNodes(
  currentStatus: AgentStatus,
  errorAgentIdx: number | null,
  artifacts: ThreadArtifacts | null,
): Node<AgentNodeData>[] {
  return AGENTS.map((agent, idx) => ({
    id: agent.id,
    type: "agent",
    position: { x: idx * (NODE_W + NODE_GAP), y: NODE_Y },
    data: {
      agent,
      state: computeNodeState(agent, currentStatus, errorAgentIdx),
      artifacts,
    },
    draggable: false,
    selectable: false,
  }));
}

function buildEdges(
  currentStatus: AgentStatus,
  errorAgentIdx: number | null,
): Edge[] {
  return AGENTS.slice(0, -1).map((agent, idx) => {
    const next = AGENTS[idx + 1];
    const sourceState = computeNodeState(agent, currentStatus, errorAgentIdx);
    const targetState = computeNodeState(next, currentStatus, errorAgentIdx);

    const isDoneEdge = sourceState === "done";
    const isActiveEdge = targetState === "active";
    const isErrorEdge = targetState === "error";

    let stroke = "var(--border-active)";
    if (isErrorEdge) stroke = "var(--accent-red)";
    else if (isActiveEdge) stroke = "var(--accent-purple)";
    else if (isDoneEdge) stroke = "var(--accent-green)";

    return {
      id: `${agent.id}->${next.id}`,
      source: agent.id,
      target: next.id,
      type: "smoothstep",
      animated: false,
      style: {
        stroke,
        strokeWidth: 1,
        strokeDasharray: "3 3",
        animation: "dash-march 0.6s linear infinite",
        opacity: isActiveEdge || isErrorEdge || isDoneEdge ? 1 : 0.55,
      },
    };
  });
}

interface PipelineFlowProps {
  currentStatus: AgentStatus;
  artifacts?: ThreadArtifacts | null;
  errorAgentIdx?: number | null;
}

export function PipelineFlow({
  currentStatus,
  artifacts = null,
  errorAgentIdx = null,
}: PipelineFlowProps) {
  const nodes = React.useMemo(
    () => buildNodes(currentStatus, errorAgentIdx, artifacts),
    [currentStatus, errorAgentIdx, artifacts],
  );
  const edges = React.useMemo(
    () => buildEdges(currentStatus, errorAgentIdx),
    [currentStatus, errorAgentIdx],
  );

  return (
    <div className="h-[280px] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="var(--border-subtle)"
        />
      </ReactFlow>
    </div>
  );
}
