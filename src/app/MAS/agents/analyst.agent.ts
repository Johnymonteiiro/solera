import { createAgent } from "langchain";
import { composeSystemPrompt } from "../lib/configStore";
import { getAgentLlm } from "../models/openAI/llm";
import { DEFAULT_LANGUAGE } from "../lib/language";
import { analystPrompt } from "../prompts/analyst.prompt";
import type { SearchLanguage } from "../types/types";

// Factory: injeta papel + override da config (/agentes). Override substitui o
// prompt base; role vira preâmbulo. Vazios → usa o prompt do código.
export async function makeAnalystAgent(
  role = "",
  promptOverride = "",
  language: SearchLanguage = DEFAULT_LANGUAGE,
) {
  return createAgent({
    model: await getAgentLlm("analyst"),
    systemPrompt: composeSystemPrompt(
      role,
      promptOverride,
      analystPrompt(language),
    ),
  });
}
