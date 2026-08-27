import { ChatOpenAI } from "@langchain/openai";
import { resolveApiKey } from "../../lib/settingsStore";

// Constrói uma instância lendo a chave/modelo das settings (com fallback .env).
// Funções (não const) para pegar mudanças feitas em /configuracoes sem restart.
export function getBaseLlm(): ChatOpenAI {
  return new ChatOpenAI({
    model: resolveApiKey("LLM_MODEL") ?? "gpt-4o",
    temperature: 0.3,
    timeout: 60_000,
    apiKey: resolveApiKey("OPENAI_API_KEY"),
  });
}

// Exportadas para irem no JudgeRunMeta — o dataset do estudo precisa registrar
// com que modelo e temperatura cada nota foi produzida.
export const JUDGE_TEMPERATURE = 0.1;

export function getJudgeModelName(): string {
  return resolveApiKey("LLM_MODEL") ?? "gpt-4o";
}

// Judge — temperatura baixa para scoring determinístico. ATENÇÃO: baixa não é
// zero e nem zero seria determinístico; a variação residual é medida pelo
// test-retest (/api/mas/export/judge-repeat).
export function getJudgeLlm(): ChatOpenAI {
  return new ChatOpenAI({
    model: getJudgeModelName(),
    temperature: JUDGE_TEMPERATURE,
    timeout: 60_000,
    apiKey: resolveApiKey("OPENAI_API_KEY"),
  });
}
