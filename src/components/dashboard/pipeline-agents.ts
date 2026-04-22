import { AgentStatus } from "@/app/MAS/types/types";
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

export interface AgentDef {
  id: string;
  label: string;
  icon: LucideIcon;
  statuses: AgentStatus[];
  implemented: boolean;
}

export const AGENTS: AgentDef[] = [
  {
    id: "researcher",
    label: "Researcher",
    icon: Search,
    statuses: ["researching"],
    implemented: true,
  },
  {
    id: "analyst",
    label: "Analyst",
    icon: Brain,
    statuses: ["analyzing"],
    implemented: false,
  },
  {
    id: "writer",
    label: "Writer",
    icon: PenTool,
    statuses: ["writing"],
    implemented: false,
  },
  {
    id: "critic",
    label: "Critic",
    icon: ShieldCheck,
    statuses: ["critiquing"],
    implemented: false,
  },
  {
    id: "hitl",
    label: "HITL",
    icon: UserCheck,
    statuses: ["awaiting_review", "revising"],
    implemented: false,
  },
  {
    id: "publisher",
    label: "Publisher",
    icon: Send,
    statuses: ["publishing"],
    implemented: false,
  },
];

export const STATE_LABEL: Record<NodeState, string> = {
  active: "ativo",
  done: "concluído",
  pending: "pendente",
  skeleton: "em breve",
  error: "erro",
};

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
