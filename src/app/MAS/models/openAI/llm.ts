import { ChatOpenAI } from "@langchain/openai";

// Instância principal compartilhada — gpt-4o com temperatura moderada
export const base_llm = new ChatOpenAI({
  model: process.env.LLM_MODEL ?? "gpt-4o",
  temperature: 0.3,
  timeout: 60_000,
  apiKey: process.env.OPENAI_API_KEY,
});

// Instância do Critic — temperatura baixa para scoring determinístico
export const criticLlm = new ChatOpenAI({
  model: process.env.LLM_MODEL ?? "gpt-4o",
  temperature: 0.1,
  timeout: 60_000,
  apiKey: process.env.OPENAI_API_KEY,
});
