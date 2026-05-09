import { createAgent } from "langchain";
import { base_llm } from "../models/openAI/llm";
import { ANALYST_PROMPT } from "../prompts/analyst.prompt";

export const analystAgent = createAgent({
  model: base_llm,
  systemPrompt: ANALYST_PROMPT,
});
