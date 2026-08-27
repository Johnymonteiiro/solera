import { END, START, StateGraph } from "@langchain/langgraph";
import { MAX_JUDGE_RETRIES, MAX_REVISIONS } from "../constants";
import { getCheckpointer } from "../lib/checkpointer";
import { analystNode } from "../nodes/analytic.node";
import { judgeNode } from "../nodes/judge.node";
import { hitlNode } from "../nodes/hitl.node";
import { publisherNode } from "../nodes/publisher.node";
import { researcherNode } from "../nodes/researcher.node";
import { writerNode } from "../nodes/writer.node";
import { AgentState, State } from "../states/states";

// ─── Funções de roteamento ────────────────────────────────────────────────────
export function routeAfterResearcher(
  state: State,
): "analyst" | typeof END {
  // Researcher seta status="stopped" quando não acha fontes (tópico inválido).
  // Sem isso, analyst e writer rodariam à toa, gastando LLM.
  if (state.status === "stopped") return END;
  return "analyst";
}

export function routeAfterWriter(state: State): "judge" | typeof END {
  // Writer aborta com status="error" (ex: insights insuficientes). Encerrar aqui
  // evita o loop writer↔judge (o judge pontuaria draft vazio 0/10 e devolveria
  // pro writer, que aborta de novo — travando a tela e gastando LLM à toa).
  if (state.status === "error") return END;
  return "judge";
}

export function routeAfterJudge(state: State): "hitl" | "writer" {
  // Modo experimento (judgeLoop=false): o judge já pontuou o draft (a nota
  // fica no state pra coleta do estudo), mas pulamos a reescrita automática —
  // vai direto pro HITL. Isola o efeito do loop do judge na condição "sem".
  if (state.judgeLoop === false) {
    console.log("[graph] judgeLoop=false — pulando loop, indo pro HITL");
    return "hitl";
  }
  // Fallback defensivo: threads antigos no checkpoint não têm judgeRetries.
  const retries = state.judgeRetries ?? 0;
  // Circuit breaker: depois de MAX_JUDGE_RETRIES re-escritas automáticas,
  // sempre vai pro HITL — o humano decide o que fazer (publicar mesmo assim
  // ou mandar pra revisão com instruções específicas).
  if (retries >= MAX_JUDGE_RETRIES) {
    console.warn(
      `[graph] judge retries=${retries} (>= ${MAX_JUDGE_RETRIES}) — forçando HITL`,
    );
    return "hitl";
  }
  // score < 7 (inclui 0 default quando judge falha) → reescreve antes de ir ao humano.
  // 7 força "bom" (não apenas mediano) e filtra a maior parte dos posts off-topic.
  if (state.judgement.score < 7) return "writer";
  return "hitl";
}

export function routeAfterHITL(
  state: State,
): "publisher" | "writer" | "researcher" | typeof END {
  if (!state.humanFeedback) {
    console.error("[graph] humanFeedback null após HITL — encerrando");
    return END;
  }
  const decision = state.humanFeedback.decision;
  if (decision === "approve") return "publisher";
  if (decision === "stop") return END;
  if (decision === "restart_research") return "researcher";
  // reject: verifica limite de revisões ANTES de rotear
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
    .addNode("judge", judgeNode)
    .addNode("hitl", hitlNode)
    .addNode("publisher", publisherNode)
    .addEdge(START, "researcher")
    .addConditionalEdges("researcher", routeAfterResearcher, {
      analyst: "analyst",
      [END]: END,
    })
    .addEdge("analyst", "writer")
    .addConditionalEdges("writer", routeAfterWriter, {
      judge: "judge",
      [END]: END,
    })
    .addConditionalEdges("judge", routeAfterJudge, {
      hitl: "hitl",
      writer: "writer",
    })
    .addConditionalEdges("hitl", routeAfterHITL, {
      // HITL → Publicação, reescrita, re-pesquisa ou fim
      publisher: "publisher",
      writer: "writer",
      researcher: "researcher",
      [END]: END,
    })
    .addEdge("publisher", END);
  return workflow.compile({ checkpointer: getCheckpointer() });
}

export function getGraph(): any {
  // Em dev, reconstrói sempre — assim mudanças de código nos nós/arestas valem
  // sem reiniciar o server. O estado e os interrupts vivem no checkpointer
  // (singleton em globalThis), não no objeto do grafo, então rebuild é seguro.
  if (process.env.NODE_ENV !== "production") {
    return buildCompiledGraph();
  }
  if (!globalThis.__graph) {
    globalThis.__graph = buildCompiledGraph();
  }
  return globalThis.__graph;
}
