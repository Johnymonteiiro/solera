import {
  AgentStatus,
  CritiqueResult,
  HumanFeedback,
  PostSize,
  ResearchResult,
} from "@/app/MAS/types/types";
import {
  Brain,
  PenTool,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export type NodeState = "active" | "done" | "pending" | "skeleton" | "error";

export interface ThreadArtifacts {
  researchResults: ResearchResult[];
  insights: string[];
  draft: string;
  critique: CritiqueResult | null;
  humanFeedback: HumanFeedback | null;
  revisionCount: number;
  postSize: PostSize;
  finalPostUrl: string | null;
}

export type ArtifactKey = keyof ThreadArtifacts;

export interface ArtifactDef {
  label: string;
  key: ArtifactKey;
}

export interface AgentDef {
  id: string;
  label: string;
  icon: LucideIcon;
  statuses: AgentStatus[];
  implemented: boolean;
  activeLabel: string;
  artifact: ArtifactDef | null;
}

export const AGENTS: AgentDef[] = [
  {
    id: "researcher",
    label: "Researcher",
    icon: Search,
    statuses: ["researching"],
    implemented: true,
    activeLabel: "pesquisando...",
    artifact: { label: "ver tópicos", key: "researchResults" },
  },
  {
    id: "analyst",
    label: "Analyst",
    icon: Brain,
    statuses: ["analyzing"],
    implemented: true,
    activeLabel: "analisando...",
    artifact: { label: "ver insights", key: "insights" },
  },
  {
    id: "writer",
    label: "Writer",
    icon: PenTool,
    statuses: ["writing", "revising"],
    implemented: true,
    activeLabel: "escrevendo...",
    artifact: { label: "ver rascunho", key: "draft" },
  },
  {
    id: "critic",
    label: "Critic",
    icon: ShieldCheck,
    statuses: ["critiquing"],
    implemented: true,
    activeLabel: "avaliando...",
    artifact: { label: "ver crítica", key: "critique" },
  },
  {
    id: "hitl",
    label: "HITL",
    icon: UserCheck,
    statuses: ["awaiting_review"],
    implemented: true,
    activeLabel: "aguardando revisão...",
    artifact: { label: "ver feedback", key: "humanFeedback" },
  },
  {
    id: "publisher",
    label: "Publisher",
    icon: Send,
    statuses: ["publishing"],
    implemented: true,
    activeLabel: "publicando...",
    artifact: { label: "ver post", key: "finalPostUrl" },
  },
];

export const STATE_LABEL: Record<NodeState, string> = {
  active: "ativo",
  done: "concluído",
  pending: "pendente",
  skeleton: "em breve",
  error: "erro",
};

export function badgeLabel(agent: AgentDef, state: NodeState): string {
  if (state === "active") return agent.activeLabel;
  return STATE_LABEL[state];
}

export function hasArtifact(
  agent: AgentDef,
  artifacts: ThreadArtifacts | null,
): boolean {
  if (!agent.artifact || !artifacts) return false;
  const value = artifacts[agent.artifact.key];
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function computeNodeState(
  agent: AgentDef,
  currentStatus: AgentStatus,
  errorAgentIdx: number | null = null,
): NodeState {
  const thisIdx = AGENTS.findIndex((a) => a.id === agent.id);

  if (currentStatus === "error") {
    if (errorAgentIdx !== null && errorAgentIdx === thisIdx) return "error";
    if (errorAgentIdx !== null && thisIdx < errorAgentIdx) return "done";
    return agent.implemented ? "pending" : "skeleton";
  }

  if (agent.statuses.includes(currentStatus)) return "active";

  if (currentStatus === "done") {
    return agent.implemented ? "done" : "skeleton";
  }

  const currentIdx = AGENTS.findIndex((a) => a.statuses.includes(currentStatus));
  if (currentIdx !== -1 && currentIdx > thisIdx) return "done";

  return agent.implemented ? "pending" : "skeleton";
}
