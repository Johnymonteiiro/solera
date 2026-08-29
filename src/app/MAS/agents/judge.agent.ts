import { createAgent } from "langchain";
import { getJudgeLlm } from "../models/openAI/llm";


interface judgeAgentProps {
    prompts:string
    draft:string
}
export async function judgeAgent ({ prompts, draft}: judgeAgentProps) {

 const judge_agent = createAgent({
  model: await getJudgeLlm(),
  systemPrompt: prompts,
});

const response = await judge_agent.invoke({
     messages: [{ role: "user", content: draft }],
})

return { response }
}