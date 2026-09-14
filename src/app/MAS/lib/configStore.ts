import { agentConfigs, getDb, isDbConfigured } from "@/db";
import { JUDGE_DEFAULT_MODEL } from "../models/openAI/models";
import { cachedReader } from "./configCache";

// Config dos agentes persistida na tabela `agent_configs` (antes:
// data/agent-config.json — ver drizzle/0006_config.sql).
// - enabled: participa do pipeline (para o judge, enabled = loop de reescrita ligado;
//   mesmo desligado ele ainda pontua uma vez, para o estudo Agent-as-judge).
// - model: modelo deste agente; vazio herda LLM_MODEL. O Judge tem o seu próprio
//   de propósito — ler a mesma chave que o Writer fazia o juiz avaliar texto do
//   próprio modelo (viés de auto-preferência).
// - role: papel do agente — injetado como preâmbulo no system prompt (composeSystemPrompt).
// - promptOverride: sobrepõe o prompt do código. Para researcher/analyst substitui
//   o system prompt base; para writer/judge é prependado (o prompt dinâmico é mantido).
//   Vazio = usa o default do código.
// Ambos (role + promptOverride) são combinados por composeSystemPrompt() nos nós de LLM.

export interface AgentConfig {
  enabled: boolean;
  /** Modelo deste agente. Vazio = herda LLM_MODEL. Ver models/openAI/llm.ts. */
  model: string;
  role: string;
  promptOverride: string;
}

export type AgentId =
  | "researcher"
  | "analyst"
  | "writer"
  | "judge"
  | "hitl"
  | "publisher";

export type AgentConfigMap = Record<AgentId, AgentConfig>;

export const AGENT_IDS: AgentId[] = [
  "researcher",
  "analyst",
  "writer",
  "judge",
  "hitl",
  "publisher",
];

const DEFAULT_ROLES: Record<AgentId, string> = {
  researcher:
    "Pesquisa a web (Tavily/Brave) por fontes relevantes e confiáveis sobre o tópico.",
  analyst:
    "Filtra as fontes e extrai 3–5 insights de valor, descartando ruído e viés comercial.",
  writer:
    "Escreve e revisa o rascunho do post de LinkedIn a partir dos insights e do feedback.",
  judge:
    "Avalia o rascunho (LLM-as-judge): 4 dimensões 1–5 + nota geral; a decisão ACCEPT/REJECT sai da regra em código.",
  hitl:
    "Ponto de revisão humana: aprova, pede revisão, refaz a pesquisa ou encerra.",
  publisher: "Publica o post aprovado no LinkedIn e salva o registro.",
};

// Vazio = herda LLM_MODEL. Só o judge nasce com modelo próprio: é o default que
// desfaz o acoplamento com o writer sem exigir que alguém abra a tela /agentes.
const DEFAULT_MODELS: Record<AgentId, string> = {
  researcher: "",
  analyst: "",
  writer: "",
  judge: JUDGE_DEFAULT_MODEL,
  hitl: "",
  publisher: "",
};

function defaults(): AgentConfigMap {
  return Object.fromEntries(
    AGENT_IDS.map((id) => [
      id,
      {
        enabled: true,
        model: DEFAULT_MODELS[id],
        role: DEFAULT_ROLES[id],
        promptOverride: "",
      },
    ]),
  ) as AgentConfigMap;
}

// Servido de MEMÓRIA (lib/configCache.ts), pré-carregado no boot por
// src/instrumentation.ts. Antes, cada construção de agente relia esta tabela —
// e com o banco em outra região isso custava ~300ms por nó do grafo.
const configCache = cachedReader<AgentConfigMap>(
  "agent_configs",
  () => loadAgentConfig(),
  () => defaults(),
);

/** Carrega a config dos agentes para a memória. Chamado no boot. */
export async function preloadAgentConfig(): Promise<void> {
  if (!isDbConfigured()) return;
  await configCache.preload();
}

/** Descarta o cache. Chamado depois de gravar — a UI reflete na hora. */
export function invalidateAgentConfigCache(): void {
  configCache.invalidate();
}

/** Estado do cache, para o healthcheck. */
export function agentConfigCacheStatus() {
  return configCache.status();
}

// Config completa (defaults + o que estiver salvo). Sempre retorna os 6 agentes:
// uma linha faltando no banco vira o default do código, nunca um agente ausente
// — o pipeline não pode quebrar porque alguém nunca abriu a tela /agentes.
export async function getAgentConfig(): Promise<AgentConfigMap> {
  if (!isDbConfigured()) return defaults();
  return configCache.get();
}

async function loadAgentConfig(): Promise<AgentConfigMap> {
  const base = defaults();
  const rows = await getDb().select().from(agentConfigs);
  const byId = new Map(rows.map((r) => [r.agentId, r]));

  // Migração herdada: a config antiga chamava o judge de "critic". Continua aqui
  // porque a linha pode ter vindo assim do agent-config.json importado.
  const legacy = byId.get("critic");
  if (legacy && !byId.has("judge")) byId.set("judge", legacy);

  for (const id of AGENT_IDS) {
    const r = byId.get(id);
    if (!r) continue;
    base[id] = {
      enabled: r.enabled,
      // `?? base` e não `||`: string vazia gravada é uma ESCOLHA ("herda o
      // global"), e trocá-la pelo default do código ignoraria o que a pessoa
      // salvou na tela — exatamente o tipo de config silenciosamente errada que
      // já custou as notas do Judge uma vez.
      model: r.model ?? base[id].model,
      role: r.role || base[id].role,
      promptOverride: r.promptOverride,
    };
  }
  return base;
}

export async function saveAgentConfig(
  next: AgentConfigMap,
  updatedBy: string | null = null,
): Promise<void> {
  const db = getDb();
  // Antes e depois: antes evita servir a config anterior a quem ler no meio da
  // escrita; depois garante que a próxima leitura veja o que foi gravado.
  invalidateAgentConfigCache();
  const now = new Date();
  for (const id of AGENT_IDS) {
    const cfg = next[id];
    await db
      .insert(agentConfigs)
      .values({
        agentId: id,
        enabled: cfg.enabled,
        model: cfg.model ?? "",
        role: cfg.role,
        promptOverride: cfg.promptOverride,
        updatedAt: now,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: agentConfigs.agentId,
        set: {
          enabled: cfg.enabled,
          model: cfg.model ?? "",
          role: cfg.role,
          promptOverride: cfg.promptOverride,
          updatedAt: now,
          updatedBy,
        },
      });
  }
  invalidateAgentConfigCache();
}

// Compõe o system prompt final de um agente a partir da config:
//  - role (se preenchido) vira um preâmbulo de papel, sempre no topo.
//  - promptOverride: em "replace" substitui o prompt base; em "prepend" é
//    colocado antes do base (o base dinâmico é mantido). Vazio → usa o base.
export function composeSystemPrompt(
  role: string,
  promptOverride: string,
  base: string,
  mode: "replace" | "prepend" = "replace",
): string {
  const roleLine = role.trim() ? `PAPEL DESTE AGENTE: ${role.trim()}\n\n` : "";
  const ov = promptOverride.trim();
  if (mode === "prepend") {
    return roleLine + (ov ? `${ov}\n\n---\n\n` : "") + base;
  }
  return roleLine + (ov || base);
}
