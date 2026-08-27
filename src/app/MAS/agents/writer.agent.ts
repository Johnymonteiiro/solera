import { createAgent } from "langchain";
import { getBaseLlm } from "../models/openAI/llm";


interface writerAgentProps {
    prompts:string
    insightsList:string
}
export async function writerAgent ({prompts, insightsList}: writerAgentProps) {

 const writer_agent = createAgent({
  model: getBaseLlm(),
  systemPrompt: prompts,
});

const response = await writer_agent.invoke({
     messages: [{ role: "user", content: insightsList }],
})

return { response }
}