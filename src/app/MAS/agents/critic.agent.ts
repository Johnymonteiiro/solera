import { createAgent } from "langchain";
import { base_llm } from "../models/openAI/llm";


interface criticAgentProps {
    prompts:string
    draft:string
}
export async function criticAgent ({ prompts, draft}: criticAgentProps) {

 const critic_agent = createAgent({
  model: base_llm,
  systemPrompt: prompts,
});

const response = await critic_agent.invoke({
     messages: [{ role: "user", content: draft }],
})

return { response }
}