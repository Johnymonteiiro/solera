import { ChatOpenAI } from "@langchain/openai";
import { resolveApiKey } from "../../lib/settingsStore";

// Constrói uma instância lendo a chave/modelo das settings (com fallback .env).
// Funções (não const) para pegar mudanças feitas em /configuracoes sem restart.
//
// Assíncronas desde que a config saiu do disco e foi para o Postgres: um cache
// em memória preservaria a assinatura antiga, mas a primeira chamada de um
// processo frio usaria a chave do .env e o `judgeMeta.model` registraria um
// modelo que não foi o usado — dataset irreproduzível por conveniência de tipo.
export async function getBaseLlm(): Promise<ChatOpenAI> {
  const [model, apiKey] = await Promise.all([
    resolveApiKey("LLM_MODEL"),
    resolveApiKey("OPENAI_API_KEY"),
  ]);
  return new ChatOpenAI({
    model: model ?? "gpt-4o",
    temperature: 0.3,
    timeout: 60_000,
    apiKey,
  });
}

// Exportadas para irem no JudgeRunMeta — o dataset do estudo precisa registrar
// com que modelo e temperatura cada nota foi produzida.
export const JUDGE_TEMPERATURE = 0.1;

export async function getJudgeModelName(): Promise<string> {
  return (await resolveApiKey("LLM_MODEL")) ?? "gpt-4o";
}

// Judge — temperatura baixa para scoring determinístico. ATENÇÃO: baixa não é
// zero e nem zero seria determinístico; a variação residual é medida pelo
// test-retest (/api/mas/export/judge-repeat).
export async function getJudgeLlm(): Promise<ChatOpenAI> {
  const [model, apiKey] = await Promise.all([
    getJudgeModelName(),
    resolveApiKey("OPENAI_API_KEY"),
  ]);
  return new ChatOpenAI({
    model,
    temperature: JUDGE_TEMPERATURE,
    timeout: 60_000,
    apiKey,
  });
}
