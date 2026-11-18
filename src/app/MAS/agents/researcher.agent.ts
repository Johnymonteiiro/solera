import { createAgent } from "langchain";
import { composeSystemPrompt } from "../lib/configStore";
import { getAgentLlm } from "../models/openAI/llm";
import { RESEARCHER_PROMPT } from "../prompts/researcher.prompt";
import { searchTool } from "../tools/searchTool";

// Factory: papel + prompt, os dois do código (ver lib/configStore.ts).
export async function makeResearcherAgent() {
  return createAgent({
    model: await getAgentLlm("researcher"),
    tools: [searchTool],
    systemPrompt: composeSystemPrompt("researcher", RESEARCHER_PROMPT),
  });
}
