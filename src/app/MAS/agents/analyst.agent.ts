import { createAgent } from "langchain";
import { composeSystemPrompt } from "../lib/configStore";
import { getBaseLlm } from "../models/openAI/llm";
import { ANALYST_PROMPT } from "../prompts/analyst.prompt";

// Factory: injeta papel + override da config (/agentes). Override substitui o
// prompt base; role vira preâmbulo. Vazios → usa o prompt do código.
export async function makeAnalystAgent(role = "", promptOverride = "") {
  return createAgent({
    model: await getBaseLlm(),
    systemPrompt: composeSystemPrompt(role, promptOverride, ANALYST_PROMPT),
  });
}
