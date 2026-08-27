import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { NavigatorProvider } from "../types/types";

// Config persistida em data/settings.json — sobrepõe o .env quando preenchida.
// ⚠ Segredos em texto no disco: garantir data/ no .gitignore.

export type ApiKeyName =
  | "OPENAI_API_KEY"
  | "LLM_MODEL"
  | "TAVILY_API_KEY"
  | "BRAVE_API_KEY"
  | "BRAVE_URL";

export interface Settings {
  apiKeys: Partial<Record<ApiKeyName, string>>;
  linkedin: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
  tools: {
    search: { provider: NavigatorProvider; maxResults: number };
  };
  // Estudo Agent-as-judge: link do Google Form de avaliação humana.
  study: { formUrl?: string };
}

const STORE_PATH = path.join(process.cwd(), "data", "settings.json");

function defaults(): Settings {
  return {
    apiKeys: {},
    linkedin: {},
    tools: { search: { provider: "tavily", maxResults: 10 } },
    study: {},
  };
}

function merge(parsed: unknown): Settings {
  const base = defaults();
  if (!parsed || typeof parsed !== "object") return base;
  const p = parsed as Partial<Settings>;
  return {
    apiKeys: { ...base.apiKeys, ...(p.apiKeys ?? {}) },
    linkedin: { ...base.linkedin, ...(p.linkedin ?? {}) },
    tools: {
      search: { ...base.tools.search, ...(p.tools?.search ?? {}) },
    },
    study: { ...base.study, ...(p.study ?? {}) },
  };
}

// Leitura síncrona — usada pelos resolvers em call sites que não são async.
function readSync(): Settings {
  try {
    return merge(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")));
  } catch {
    return defaults();
  }
}

export async function getSettings(): Promise<Settings> {
  try {
    return merge(JSON.parse(await fsp.readFile(STORE_PATH, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaults();
    throw err;
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  await fsp.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fsp.writeFile(STORE_PATH, JSON.stringify(merge(next), null, 2), "utf8");
}

// ─── Resolvers (settings.json → fallback .env) ────────────────────────────────
export function resolveApiKey(name: ApiKeyName): string | undefined {
  const v = readSync().apiKeys[name];
  return v && v.trim() ? v.trim() : process.env[name];
}

export function resolveLinkedIn(): {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
} {
  const s = readSync().linkedin;
  return {
    clientId: s.clientId?.trim() || process.env.LINKEDIN_CLIENT_ID,
    clientSecret: s.clientSecret?.trim() || process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: s.redirectUri?.trim() || process.env.LINKEDIN_REDIRECT_URI,
  };
}

export async function getSearchToolConfig(): Promise<{
  provider: NavigatorProvider;
  maxResults: number;
}> {
  const s = await getSettings();
  const provider =
    s.tools.search.provider ||
    (process.env.DEFAULT_NAVIGATOR as NavigatorProvider) ||
    "tavily";
  return { provider, maxResults: s.tools.search.maxResults || 10 };
}
