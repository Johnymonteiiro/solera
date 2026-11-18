import { createAgent } from "langchain";
import { getJudgeLlm } from "../models/openAI/llm";


interface judgeAgentProps {
    prompts:string
    draft:string
    /** Modelo explícito do Critic; ausente = o da config. */
    model?:string
}
export async function judgeAgent ({ prompts, draft, model}: judgeAgentProps) {

 const judge_agent = createAgent({
  model: await getJudgeLlm(model),
  systemPrompt: prompts,
});

const response = await judge_agent.invoke({
     messages: [{ role: "user", content: draft }],
})

return { response }
}