import { ChatOpenAI } from "@langchain/openai";
import { AgentId, getAgentConfig } from "../../lib/configStore";
import { resolveApiKey } from "../../lib/settingsStore";
import { FALLBACK_MODEL } from "./models";

// Constrói uma instância lendo chave/modelo das settings (com fallback .env).
// Funções (não const) para pegar mudanças feitas em /configuracoes e /agentes
// sem restart.
//
// Assíncronas desde que a config saiu do disco e foi para o Postgres: um cache
// em memória preservaria a assinatura antiga, mas a primeira chamada de um
// processo frio usaria a chave do .env e o `judgeMeta.model` registraria um
// modelo que não foi o usado — dataset irreproduzível por conveniência de tipo.

/**
 * Modelo efetivo de um agente, na ordem: config do agente → LLM_MODEL → fallback.
 *
 * Cada agente tem o seu porque o Judge NÃO pode compartilhar modelo com o
 * Writer: avaliar o texto do próprio modelo é viés de auto-preferência. Ver
 * `JUDGE_DEFAULT_MODEL` em ./models.
 */
export async function getAgentModelName(agentId: AgentId): Promise<string> {
  const [config, global] = await Promise.all([
    getAgentConfig(),
    resolveApiKey("LLM_MODEL"),
  ]);
  return pick(config[agentId]?.model, global);
}

/** Config do agente → LLM_MODEL → fallback. Vazio significa "herda". */
function pick(
  doAgente: string | undefined,
  global: string | null | undefined,
): string {
  return doAgente?.trim() || global || FALLBACK_MODEL;
}

/**
 * Constrói o LLM com UMA rodada de leituras, não três em série.
 *
 * Cada query custa ~300ms de RTT (banco em us-west-2). Resolver o modelo e
 * depois a chave, em sequência, dobrava esse custo em toda construção de agente
 * — e o grafo constrói vários por execução. Em paralelo, o custo é o de uma.
 */
async function build(
  agentId: AgentId,
  temperature: number,
  modelOverride?: string,
): Promise<ChatOpenAI> {
  const [config, global, apiKey] = await Promise.all([
    getAgentConfig(),
    resolveApiKey("LLM_MODEL"),
    resolveApiKey("OPENAI_API_KEY"),
  ]);
  return new ChatOpenAI({
    // Override POR EXECUÇÃO vence a config do agente. É como a condição
    // experimental do corpus entra sem mutar config global entre runs.
    model: modelOverride?.trim() || pick(config[agentId]?.model, global),
    temperature,
    timeout: 60_000,
    apiKey,
  });
}

/** Temperatura default dos agentes geradores. */
export const BASE_TEMPERATURE = 0.3;

/**
 * Temperatura POR AGENTE. O que não está aqui usa BASE_TEMPERATURE.
 *
 * O writer sobe e o resto NÃO, e a assimetria é o ponto:
 *
 * - WRITER a 0.9. A 0.3 ele produzia clones — mesma abertura expositiva, mesmos
 *   conectivos, mesmo CTA, para tópicos completamente diferentes. Reescrever o
 *   prompt melhorou a forma mas não quebrou o padrão: mesmo com construções
 *   proibidas pelo nome, ele voltava a "Além disso" e à pergunta retórica. Numa
 *   temperatura baixa o modelo colapsa no texto mais provável, que é justamente
 *   a redação genérica que o instrumento do estudo pontua como mediana.
 *
 * - ANALYST fica em 0.3, de propósito. O trabalho dele é EXTRAIR número, caso e
 *   ressalva das fontes, e o prompt diz "NUNCA invente número". Subir a
 *   temperatura de um extrator é convidar exatamente a alucinação que o dado do
 *   estudo não pode ter.
 *
 * - RESEARCHER fica em 0.3: ele dirige ferramenta de busca, não escreve prosa.
 *
 * PARA O ESTUDO: se a temperatura virar condição experimental (metade do corpus
 * em 0.3, metade em 0.9), este valor precisa ser GRAVADO por execução — hoje só
 * a do judge vai para o dataset, em `judgements.temperature`. Variar sem gravar
 * produziria um corpus cuja variação ninguém consegue explicar depois.
 */
const AGENT_TEMPERATURE: Partial<Record<AgentId, number>> = {
  writer: 0.9,
};

/**
 * LLM de um agente gerador.
 *
 * `agentId` é obrigatório: sem ele o call site voltaria a cair num modelo
 * global implícito, que é exatamente o acoplamento que esta mudança desfez —
 * e o compilador é o que impede isso de acontecer em silêncio.
 */
export async function getAgentLlm(
  agentId: AgentId,
  modelOverride?: string,
): Promise<ChatOpenAI> {
  return build(
    agentId,
    AGENT_TEMPERATURE[agentId] ?? BASE_TEMPERATURE,
    modelOverride,
  );
}

/** Temperatura efetiva de um agente — para log e para o dataset. */
export function getAgentTemperature(agentId: AgentId): number {
  return AGENT_TEMPERATURE[agentId] ?? BASE_TEMPERATURE;
}

// Exportadas para irem no JudgeRunMeta — o dataset do estudo precisa registrar
// com que modelo e temperatura cada nota foi produzida.
export const JUDGE_TEMPERATURE = 0.1;

export async function getJudgeModelName(): Promise<string> {
  return getAgentModelName("judge");
}

// Judge — temperatura baixa para scoring determinístico. ATENÇÃO: baixa não é
// zero e nem zero seria determinístico; a variação residual é medida pelo
// test-retest (/api/mas/export/judge-repeat).
export async function getJudgeLlm(): Promise<ChatOpenAI> {
  return build("judge", JUDGE_TEMPERATURE);
}
