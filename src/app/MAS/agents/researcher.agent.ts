import { createAgent } from "langchain";
import { composeSystemPrompt } from "../lib/configStore";
import { getBaseLlm } from "../models/openAI/llm";
import { RESEARCHER_PROMPT } from "../prompts/researcher.prompt";
import { searchTool } from "../tools/searchTool";

// Factory: injeta papel + override da config (/agentes). Override substitui o
// prompt base; role vira preâmbulo. Vazios → usa o prompt do código.
export function makeResearcherAgent(role = "", promptOverride = "") {
  return createAgent({
    model: getBaseLlm(),
    tools: [searchTool],
    systemPrompt: composeSystemPrompt(role, promptOverride, RESEARCHER_PROMPT),
  });
}

export const researcherAgent = makeResearcherAgent();
