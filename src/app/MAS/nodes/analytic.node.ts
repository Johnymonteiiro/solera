import { AIMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { analystAgent } from "../agents/analyst.agent";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";
import { ResearchResult } from "../types/types";

const MAX_CHARACTERS = 500;
const MIN_RELEVANT_SOURCES = 2;

function formatPayloadForAnalyst(
  topic: string,
  results: ResearchResult[],
): string {
  if (results.length === 0) {
    return `TÓPICO: ${topic}\n\nFONTES: (nenhuma fonte coletada)`;
  }
  const sources = results
    .map((r, i) => {
      const snippet = r.content.slice(0, MAX_CHARACTERS);
      return `[${i + 1}] ${r.title}\nURL: ${r.url}\n${snippet}`;
    })
    .join("\n\n");

  return `TÓPICO: ${topic}\n\nFONTES:\n${sources}`;
}

interface AnalystOutput {
  filtered?: unknown;
  discarded?: unknown;
  insights?: unknown;
}

export async function analystNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;
  if (threadId) {
    emitEvent(threadId, { type: "analyzing", threadId });
  }

  const payload = formatPayloadForAnalyst(state.topic, state.researchResults);
  const result = await analystAgent.invoke({
    messages: [{ role: "user", content: payload }],
  });

  const lastAi = [...(result.messages ?? [])]
    .reverse()
    .find((m) => AIMessage.isInstance(m)) as AIMessage | undefined;
  const raw = typeof lastAi?.content === "string" ? lastAi.content : "";

  let insights: string[] = [];
  let filteredCount = 0;
  let discardedCount = 0;

  try {
    const parsed = JSON.parse(raw) as AnalystOutput;
    if (Array.isArray(parsed.insights)) {
      insights = parsed.insights.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
    }
    if (Array.isArray(parsed.filtered)) filteredCount = parsed.filtered.length;
    if (Array.isArray(parsed.discarded))
      discardedCount = parsed.discarded.length;
  } catch {
    console.warn(`[analyst] parse falhou — content=${raw.slice(0, 200)}`);
  }

  console.log(
    `[analyst] descartou ${discardedCount} fontes, manteve ${filteredCount}, extraiu ${insights.length} insights`,
  );

  if (insights.length < MIN_RELEVANT_SOURCES) {
    console.warn(
      `[analyst] insights insuficientes (${insights.length}) — pipeline abortará`,
    );
  }

  return {
    insights,
    status: "analyzing",
  };
}
