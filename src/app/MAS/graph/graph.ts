import { END, START, StateGraph } from "@langchain/langgraph";
import { MAX_JUDGE_RETRIES, MAX_REVISIONS } from "../constants";
import { getCheckpointer } from "../lib/checkpointer";
import { analystNode } from "../nodes/analytic.node";
import { judgeNode } from "../nodes/judge.node";
import { hitlNode } from "../nodes/hitl.node";
import { publisherNode } from "../nodes/publisher.node";
import { researcherNode } from "../nodes/researcher.node";
import { writerNode } from "../nodes/writer.node";
import { conformanceFailures } from "../lib/rubric";
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
  // Gate de qualidade: a regra PRÉ-REGISTRADA do estudo (todas as dimensões
  // ≥ ACCEPT_MIN), calculada em `lib/rubric.ts` e gravada em `judgement.decision`.
  //
  // É deliberado que o gate de produção seja a MESMA regra que a análise aplica
  // à mediana humana: o estudo mede o Critic como mecanismo de controle de
  // qualidade, e medir um limiar que o sistema não usa responderia outra
  // pergunta. Mexer no limiar depois de ver as respostas humanas invalida o
  // pré-registro — ver ACCEPT_MIN.
  //
  // O default do state tem overall=0 e decision="REJECT", então uma falha de
  // parse do judge cai em reescrita, como antes.
  if (state.judgement.decision === "REJECT") return "writer";

  // ── Gate de conformidade ──────────────────────────────────────────────────
  //
  // Fatos sobre o texto, calculados em código, não percepção: faixa de
  // caracteres, link no corpo, engagement bait. Eles já eram medidos e não
  // faziam nada — um post de 1.202 chars num alvo de 500–900, com bait, passava
  // com ACCEPT porque as quatro dimensões estavam ok.
  //
  // Fica DEPOIS do gate de qualidade e NÃO altera `judgement.decision`: a
  // decisão é a variável do estudo, tem que continuar sendo só a regra da
  // rubrica, aplicável igual à mediana humana. Isto aqui é roteamento — o
  // motivo fica recuperável nas próprias flags da nota.
  const conformidade = conformanceFailures(state.judgement);
  if (conformidade.length) {
    console.log(
      `[graph] ACCEPT na qualidade mas falha de conformidade (${conformidade.join(", ")}) — devolvendo ao writer`,
    );
    return "writer";
  }
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
