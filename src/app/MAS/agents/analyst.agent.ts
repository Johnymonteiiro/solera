import { createAgent } from "langchain";
import { composeSystemPrompt } from "../lib/configStore";
import { getAgentLlm } from "../models/openAI/llm";
import { DEFAULT_LANGUAGE } from "../lib/language";
import { analystPrompt } from "../prompts/analyst.prompt";
import type { SearchLanguage } from "../types/types";

// Factory: papel + prompt, os dois do código (ver lib/configStore.ts).
export async function makeAnalystAgent(
  language: SearchLanguage = DEFAULT_LANGUAGE,
) {
  return createAgent({
    model: await getAgentLlm("analyst"),
    systemPrompt: composeSystemPrompt("analyst", analystPrompt(language)),
  });
}
