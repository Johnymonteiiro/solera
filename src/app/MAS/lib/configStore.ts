import fs from "node:fs/promises";
import path from "node:path";

// Config dos agentes persistida em data/agent-config.json.
// - enabled: participa do pipeline (para o judge, enabled = loop de reescrita ligado;
//   mesmo desligado ele ainda pontua uma vez, para o estudo Agent-as-judge).
// - role: papel do agente — injetado como preâmbulo no system prompt (composeSystemPrompt).
// - promptOverride: sobrepõe o prompt do código. Para researcher/analyst substitui
//   o system prompt base; para writer/judge é prependado (o prompt dinâmico é mantido).
//   Vazio = usa o default do código.
// Ambos (role + promptOverride) são combinados por composeSystemPrompt() nos nós de LLM.

export interface AgentConfig {
  enabled: boolean;
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
    "Avalia o rascunho (LLM-as-judge): nota 0–10 + flags de engagement bait e link no corpo.",
  hitl:
    "Ponto de revisão humana: aprova, pede revisão, refaz a pesquisa ou encerra.",
  publisher: "Publica o post aprovado no LinkedIn e salva o registro.",
};

function defaults(): AgentConfigMap {
  return Object.fromEntries(
    AGENT_IDS.map((id) => [
      id,
      { enabled: true, role: DEFAULT_ROLES[id], promptOverride: "" },
    ]),
  ) as AgentConfigMap;
}

const STORE_PATH = path.join(process.cwd(), "data", "agent-config.json");

async function readRaw(): Promise<Partial<AgentConfigMap>> {
  try {
    const buf = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(buf);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

// Config completa (defaults + o que estiver salvo). Sempre retorna os 6 agentes.
export async function getAgentConfig(): Promise<AgentConfigMap> {
  const stored = await readRaw();
  const base = defaults();
  // Migração: config antiga usava a chave "critic" — aplica no "judge".
  const legacy = (stored as Record<string, AgentConfig | undefined>).critic;
  if (legacy && !stored.judge) base.judge = { ...base.judge, ...legacy };
  for (const id of AGENT_IDS) {
    const s = stored[id];
    if (s) base[id] = { ...base[id], ...s };
  }
  return base;
}

export async function saveAgentConfig(next: AgentConfigMap): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
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
