import { ToolMessage } from "@langchain/core/messages";
import { researcherAgent } from "../agents/researcher.agent";
import { State } from "../states/states";
import { deduplicateAndRank } from "../tools/search";
import { ResearchResult } from "../types/types";

export async function researcherNode(state: State): Promise<Partial<State>> {
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

  return {
    researchResults,
    status: "researching",
  };
}
