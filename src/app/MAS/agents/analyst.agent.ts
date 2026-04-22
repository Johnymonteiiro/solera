import { createAgent } from "langchain";
import { base_llm } from "../models/openAI/llm";

export const analystAgent = createAgent({
  model: base_llm,
});