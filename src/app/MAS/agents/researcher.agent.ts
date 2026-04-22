import { createAgent } from "langchain";
import { base_llm } from "../models/openAI/llm";
import { RESEARCHER_PROMPT } from "../prompts/researcher.prompt";
import { searchTool } from "../tools/searchTool";

export const researcherAgent = createAgent({
  model: base_llm,
  tools: [searchTool],
  systemPrompt: RESEARCHER_PROMPT,
});
