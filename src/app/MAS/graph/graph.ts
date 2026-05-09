import { END, START, StateGraph } from "@langchain/langgraph";
import { MAX_REVISIONS } from "../constants";
import { getCheckpointer } from "../lib/checkpointer";
import { analystNode } from "../nodes/analytic.node";
import { criticNode } from "../nodes/critic.node";
import { hitlNode } from "../nodes/hitl.node";
import { publisherNode } from "../nodes/publisher.node";
import { researcherNode } from "../nodes/researcher.node";
import { writerNode } from "../nodes/writer.node";
import { AgentState, State } from "../states/states";

// ─── Funções de roteamento ────────────────────────────────────────────────────
export function routeAfterCritic(state: State): "hitl" | "writer" {
  // score < 7 (inclui 0 default quando critic falha) → reescreve antes de ir ao humano.
  // 7 força "bom" (não apenas mediano) e filtra a maior parte dos posts off-topic.
  if (state.critique.score < 7) return "writer";
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
    .addNode("analyst", analystNode)
    .addNode("writer", writerNode)
    .addNode("critic", criticNode)
    .addNode("hitl", hitlNode)
    .addNode("publisher", publisherNode)
    .addEdge(START, "researcher") 
    .addEdge("researcher", "analyst")
    .addEdge("analyst", "writer")
    .addEdge("writer", "critic")
    .addConditionalEdges("critic", routeAfterCritic, {
      hitl: "hitl",
      writer: "writer",
    })
    .addConditionalEdges("hitl", routeAfterHITL, {
      // HITL → Publicação, reescrita ou fim
      publisher: "publisher",
      writer: "writer",
      [END]: END,
    })
    .addEdge("publisher", END);
  return workflow.compile({ checkpointer: getCheckpointer() });
}

export function getGraph(): any {
  if (!globalThis.__graph) {
    globalThis.__graph = buildCompiledGraph();
  }
  return globalThis.__graph;
}
