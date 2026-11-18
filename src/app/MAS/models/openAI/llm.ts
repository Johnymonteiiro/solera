import { ChatOpenRouter } from "@langchain/openrouter";
import { AgentId, getAgentConfig } from "../../lib/configStore";
import { getDefaultWriterModel } from "../../lib/modelStore";
import { resolveApiKey } from "../../lib/settingsStore";
import { FALLBACK_MODEL, PROVIDERS_BY_FAMILY, toOpenRouterSlug } from "./models";

// Constrói uma instância lendo chave/modelo das settings (com fallback .env).
// Funções (não const) para pegar mudanças feitas em /configuracoes e /agentes
// sem restart.
//
// Assíncronas desde que a config saiu do disco e foi para o Postgres: um cache
// em memória preservaria a assinatura antiga, mas a primeira chamada de um
// processo frio usaria a chave do .env e o `judgeMeta.model` registraria um
// modelo que não foi o usado — dataset irreproduzível por conveniência de tipo.
//
// Todos os agentes passam pelo OpenRouter desde 2026-09-17 (antes: OpenAI
// direta). O corpus original foi gerado pela OpenAI direta — ver
// drizzle/0012_llm_models.sql.

/**
 * Modelo efetivo de um agente, como a config o grava (sem prefixo do OpenRouter
 * para os agentes antigos — é o nome que vai para `judgements.model`).
 *
 * - Writer: o default da tela /modelos (`llm_models`). O de cada execução é
 *   gravado em `runs.writer_model`; isto é só o que um run novo usaria.
 * - Demais: config do agente → FALLBACK_MODEL.
 *
 * Cada agente tem o seu porque o Judge NÃO pode compartilhar modelo com o
 * Writer: avaliar o texto do próprio modelo é viés de auto-preferência. Ver
 * `JUDGE_DEFAULT_MODEL` em ./models.
 */
export async function getAgentModelName(agentId: AgentId): Promise<string> {
  if (agentId === "writer") return getDefaultWriterModel();
  const config = await getAgentConfig();
  return config[agentId]?.model?.trim() || FALLBACK_MODEL;
}

/** Restrição de provedor para o slug, sem fallback. Ver PROVIDERS_BY_FAMILY. */
function providerFor(slug: string) {
  const only = PROVIDERS_BY_FAMILY[slug.split("/")[0]];
  if (!only) {
    console.warn(
      `[llm] ${slug}: família sem provedor fixado — o OpenRouter pode rotear entre provedores.`,
    );
    return undefined;
  }
  return { only, allow_fallbacks: false };
}

/**
 * Constrói o LLM com UMA rodada de leituras, não várias em série.
 *
 * Cada query custa ~300ms de RTT (banco em us-west-2). Resolver o modelo e
 * depois a chave, em sequência, dobrava esse custo em toda construção de agente
 * — e o grafo constrói vários por execução. Em paralelo, o custo é o de uma.
 */
async function build(
  agentId: AgentId,
  temperature: number,
  modelOverride?: string,
): Promise<ChatOpenRouter> {
  const [configured, apiKey] = await Promise.all([
    // Override POR EXECUÇÃO vence a config. É como a condição experimental do
    // corpus (o modelo do Writer) entra sem mutar config global entre runs.
    modelOverride?.trim() ? Promise.resolve(modelOverride.trim()) : getAgentModelName(agentId),
    resolveApiKey("OPENROUTER_API_KEY"),
  ]);
  if (!apiKey) {
    // Sem isto o erro chega como 401 genérico no meio do grafo.
    throw new Error(
      "OPENROUTER_API_KEY não configurada: preencha em /configuracoes (API Key) ou no .env.local.",
    );
  }
  const model = toOpenRouterSlug(configured);
  return new ChatOpenRouter({
    model,
    temperature,
    apiKey,
    provider: providerFor(model),
    siteName: "Solera",
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
): Promise<ChatOpenRouter> {
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
export async function getJudgeLlm(model?: string): Promise<ChatOpenRouter> {
  // `model` explícito vence a config: scripts do estudo precisam do MESMO juiz
  // das notas que vão comparar, independente do que estiver na tela /agentes.
  return build("judge", JUDGE_TEMPERATURE, model);
}
