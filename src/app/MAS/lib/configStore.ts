import { agentConfigs, getDb, isDbConfigured } from "@/db";
import { JUDGE_DEFAULT_MODEL } from "../models/openAI/models";
import { cachedReader } from "./configCache";

// Config dos agentes persistida na tabela `agent_configs` (antes:
// data/agent-config.json — ver drizzle/0006_config.sql).
// - enabled: participa do pipeline (para o judge, enabled = loop de reescrita ligado;
//   mesmo desligado ele ainda pontua uma vez, para o estudo Agent-as-judge).
// - model: modelo deste agente; vazio = FALLBACK_MODEL (gpt-4o). O Writer ignora
//   este campo: o modelo dele vem de /modelos (llm_models). O Judge tem o seu próprio
//   de propósito — ler a mesma chave que o Writer fazia o juiz avaliar texto do
//   próprio modelo (viés de auto-preferência).
// - role: papel do agente, SÓ DO CÓDIGO (AGENT_ROLES). Entra como preâmbulo no
//   system prompt (composeSystemPrompt).
//
// Papel e prompt deixaram de ser editáveis em 2026-09-18. Um texto livre na
// tela mudava o comportamento do agente em runtime, sem versão — foi assim que
// um override corrompeu as notas do Judge, e que Researcher e Analyst rodaram
// o corpus com prompts que não estavam no código. Agora o código é a fonte
// única e a tela só mostra. As colunas `role`/`prompt_override` continuam na
// tabela como registro do que estava configurado durante o corpus; ninguém
// mais lê nem grava nelas.

export interface AgentConfig {
  enabled: boolean;
  /** Modelo deste agente. Vazio = FALLBACK_MODEL. Ver models/openAI/llm.ts. */
  model: string;
  /** Papel do código (AGENT_ROLES). Só leitura. */
  role: string;
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

/** Papel de cada agente — em inglês, como os prompts. Fonte única. */
export const AGENT_ROLES: Record<AgentId, string> = {
  researcher:
    "Searches the web (Tavily/Brave) for relevant and reliable sources on the topic.",
  analyst:
    "Filters the sources and extracts 3–5 valuable insights, discarding noise and commercial bias.",
  writer:
    "Writes and revises the LinkedIn post draft based on the insights and the feedback.",
  judge:
    "Evaluates the draft (LLM-as-judge): 4 dimensions 1–5 + overall score; the ACCEPT/REJECT decision comes from the rule in code.",
  hitl:
    "Human review point: approves, requests a revision, redoes the research or stops.",
  publisher: "Publishes the approved post on LinkedIn and saves the record.",
};

// Vazio = FALLBACK_MODEL. Só o judge nasce com modelo próprio: é o default que
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
        role: AGENT_ROLES[id],
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
      // Papel sempre do código — ver o cabeçalho deste arquivo.
      role: AGENT_ROLES[id],
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
        updatedAt: now,
        updatedBy,
      })
      // Só liga/desliga e modelo. `role`/`prompt_override` ficam intocados:
      // são registro do que estava configurado durante o corpus.
      .onConflictDoUpdate({
        target: agentConfigs.agentId,
        set: {
          enabled: cfg.enabled,
          model: cfg.model ?? "",
          updatedAt: now,
          updatedBy,
        },
      });
  }
  invalidateAgentConfigCache();
}

/** Preâmbulo de papel + prompt do código. É o system prompt final do agente. */
export function composeSystemPrompt(agentId: AgentId, base: string): string {
  return `AGENT ROLE: ${AGENT_ROLES[agentId]}\n\n${base}`;
}
