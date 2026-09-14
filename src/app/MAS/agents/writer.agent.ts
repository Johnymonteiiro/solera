import { createAgent } from "langchain";
import { getAgentLlm } from "../models/openAI/llm";


interface writerAgentProps {
    prompts:string
    insightsList:string
    /** Modelo desta execução (condição do corpus). Vazio = config global. */
    modelOverride?:string
}
export async function writerAgent ({prompts, insightsList, modelOverride}: writerAgentProps) {

 const writer_agent = createAgent({
  model: await getAgentLlm("writer", modelOverride),
  systemPrompt: prompts,
});

const response = await writer_agent.invoke({
     messages: [{ role: "user", content: insightsList }],
})

return { response }
}