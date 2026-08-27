import { ToolMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { makeResearcherAgent } from "../agents/researcher.agent";
import { getAgentConfig } from "../lib/configStore";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";
import { deduplicateAndRank } from "../tools/search";
import { ResearchResult } from "../types/types";

export async function researcherNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;

  // Desativado na config (/agentes): passthrough (pipeline pode quebrar — avisado na UI).
  if (state.disabledAgents?.includes("researcher")) {
    console.warn("[researcher] desativado na config — pulando pesquisa");
    return { researchResults: [], status: "researching" };
  }

  const cfg = await getAgentConfig();
  const researcherAgent = makeResearcherAgent(
    cfg.researcher.role,
    cfg.researcher.promptOverride,
  );
  const result = await researcherAgent.invoke({
    messages: [{ role: "user", content: state.topic }],
  });

  const collected: ResearchResult[] = [];
  for (const msg of result.messages ?? []) {
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== "search_web") continue;
    const content = typeof msg.content === "string" ? msg.content : "";
    if (!content) continue;
    try {
      const parsed = JSON.parse(content) as ResearchResult[];
      if (Array.isArray(parsed)) collected.push(...parsed);
    } catch {
      // tool retornou string não-JSON (erro da tool); ignora esta mensagem
    }
  }

  const researchResults = deduplicateAndRank(collected);
  console.log(`[researcher] coletou ${researchResults.length} fontes únicas`);

  // Tópico inválido (nonsense) → Tavily retorna 0 fontes. Aborta o pipeline
  // ANTES de gastar LLM em analyst/writer. routeAfterResearcher manda pra END.
  if (researchResults.length === 0) {
    console.warn(
      `[researcher] tópico "${state.topic}" não retornou fontes — abortando pipeline`,
    );
    if (threadId) {
      emitEvent(threadId, {
        type: "stopped",
        threadId,
        payload: { stoppedReason: "no_research_results" },
      });
    }
    return {
      researchResults: [],
      status: "stopped",
      stoppedReason: "no_research_results",
    };
  }

  // Persiste as fontes no threadStore (via payload) para sobreviverem a
  // restart mesmo se o checkpoint for perdido — igual judgement/draft.
  if (threadId) {
    emitEvent(threadId, {
      type: "researching",
      threadId,
      payload: { researchResults },
    });
  }

  return {
    researchResults,
    status: "researching",
  };
}
