import { END, START, StateGraph } from "@langchain/langgraph";
import { MAX_REVISIONS } from "../constants";
import { getCheckpointer } from "../lib/checkpointer";
import { researcherNode } from "../nodes/nodes";
import { AgentState, State } from "../states/states";

// ─── Funções de roteamento ────────────────────────────────────────────────────
export function routeAfterCritic(state: State): "hitl" | "writer" {
  // score < 6 (inclui 0 default quando critic falha) → reescreve antes de ir ao humano
  if (state.critique.score < 6) return "writer";
  return "hitl";
}

export function routeAfterHITL(
  state: State,
): "publisher" | "writer" | typeof END {
  if (!state.humanFeedback) {
    console.error("[graph] humanFeedback null após HITL — encerrando");
    return END;
  }
  if (state.humanFeedback.decision === "approve") return "publisher";
  // Reject: verifica limite de revisões ANTES de rotear
  if (state.revisionCount >= MAX_REVISIONS) {
    console.warn(
      `[graph] Limite de ${MAX_REVISIONS} revisões atingido — encerrando`,
    );
    return END;
  }
  return "writer";
}

declare global {
  // eslint-disable-next-line no-var
  var __graph: ReturnType<typeof buildCompiledGraph> | undefined;
}

function buildCompiledGraph(): any {
  const workflow = new StateGraph(AgentState)
    .addNode("researcher", researcherNode)
    .addEdge(START, "researcher");

  return workflow.compile({ checkpointer: getCheckpointer() });
}


export function getGraph(): any {
  if (!globalThis.__graph) {
    globalThis.__graph = buildCompiledGraph();
  }
  return globalThis.__graph;
}
