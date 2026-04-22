"use client";

import { AgentStatus } from "@/app/MAS/types/types";
import {
  AGENTS,
  NodeState,
  STATE_LABEL,
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
import { Check, type LucideIcon } from "lucide-react";
import * as React from "react";

const NODE_W = 124;
const NODE_GAP = 40;
const NODE_Y = 20;

const CARD_CLASSES: Record<NodeState, string> = {
  active:
    "border-[var(--accent-purple)] bg-[var(--accent-purple-dim)] text-[var(--text-primary)] shadow-[0_0_0_3px_rgba(123,92,240,0.18)]",
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
  done: "border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/15 text-[var(--accent-green)]",
  pending:
    "border border-[var(--border-active)]/60 bg-[var(--bg-input)] text-[var(--text-muted)]",
  skeleton:
    "border border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)]",
  error:
    "border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/15 text-[var(--accent-red)]",
};

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  icon: LucideIcon;
  state: NodeState;
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const Icon = data.icon;
  const isActive = data.state === "active";
  const isDone = data.state === "done";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3.5 transition-colors",
        CARD_CLASSES[data.state],
      )}
      style={{ width: NODE_W }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-[var(--border-active)]"
      />
      <div
        className={cn(
          "relative flex size-8 items-center justify-center rounded-lg",
          ICON_WRAP_CLASSES[data.state],
        )}
      >
        {isActive && (
          <span className="absolute inset-0 animate-ping rounded-lg bg-[var(--accent-purple)]/30" />
        )}
        <Icon size={16} strokeWidth={1.75} className="relative" />
      </div>
      <span className="text-[12px] font-medium">{data.label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px]",
          BADGE_CLASSES[data.state],
        )}
      >
        {isDone && <Check size={9} strokeWidth={3} />}
        {STATE_LABEL[data.state]}
      </span>
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
): Node<AgentNodeData>[] {
  return AGENTS.map((agent, idx) => ({
    id: agent.id,
    type: "agent",
    position: { x: idx * (NODE_W + NODE_GAP), y: NODE_Y },
    data: {
      label: agent.label,
      icon: agent.icon,
      state: computeNodeState(agent, currentStatus, errorAgentIdx),
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
      animated: true,
      style: {
        stroke,
        strokeWidth: 1.5,
        strokeDasharray: "5 4",
        opacity:
          isActiveEdge || isErrorEdge || isDoneEdge ? 1 : 0.55,
      },
    };
  });
}

interface PipelineFlowProps {
  currentStatus: AgentStatus;
  errorAgentIdx?: number | null;
}

export function PipelineFlow({
  currentStatus,
  errorAgentIdx = null,
}: PipelineFlowProps) {
  const nodes = React.useMemo(
    () => buildNodes(currentStatus, errorAgentIdx),
    [currentStatus, errorAgentIdx],
  );
  const edges = React.useMemo(
    () => buildEdges(currentStatus, errorAgentIdx),
    [currentStatus, errorAgentIdx],
  );

  return (
    <div className="h-[240px] w-full">
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
