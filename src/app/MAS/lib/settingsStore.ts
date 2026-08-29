import { eq, inArray } from "drizzle-orm";
import { appSettings, getDb, isDbConfigured } from "@/db";
import { NavigatorProvider } from "../types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Config do workspace, agora no Postgres (`app_settings`) — antes era
// data/settings.json. Ver drizzle/0006_config.sql para o porquê.
//
// O .env continua sendo FALLBACK, não substituto: valor gravado aqui sobrepõe,
// campo vazio cai no `process.env`. É o que mantém o dev funcionando sem banco
// e o que a UI mostra como "usando .env".
//
// TUDO É ASSÍNCRONO. Os resolvers eram síncronos quando liam arquivo com
// readFileSync; virar cache em memória para preservar a assinatura seria pior
// que o ruído do `await`: a primeira chamada de um processo frio serviria a
// chave do .env em vez da do banco, e o `judgeMeta.model` do dataset registraria
// um modelo que não foi o usado. Config silenciosamente errada já custou as
// notas do Judge uma vez.
// ─────────────────────────────────────────────────────────────────────────────

export type ApiKeyName =
  | "OPENAI_API_KEY"
  | "LLM_MODEL"
  | "TAVILY_API_KEY"
  | "BRAVE_API_KEY"
  | "BRAVE_URL";

/** Chaves cujo valor NUNCA volta num GET — só presença e últimos 4 dígitos. */
export const SECRET_KEYS: string[] = [
  "OPENAI_API_KEY",
  "TAVILY_API_KEY",
  "BRAVE_API_KEY",
  "LINKEDIN_CLIENT_SECRET",
];

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.includes(key);
}

// Nomes das chaves na tabela. Estilo .env de propósito: é o mesmo vocabulário
// que a pessoa vê no .env.local e na aba Variáveis, então não há tradução mental
// entre os dois lugares.
export const LINKEDIN_KEYS = {
  clientId: "LINKEDIN_CLIENT_ID",
  clientSecret: "LINKEDIN_CLIENT_SECRET",
  redirectUri: "LINKEDIN_REDIRECT_URI",
} as const;

export const SEARCH_PROVIDER_KEY = "SEARCH_PROVIDER";
export const SEARCH_MAX_RESULTS_KEY = "SEARCH_MAX_RESULTS";
export const STUDY_FORM_URL_KEY = "STUDY_FORM_URL";

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
  study: { formUrl?: string };
}

const API_KEY_NAMES: ApiKeyName[] = [
  "OPENAI_API_KEY",
  "LLM_MODEL",
  "TAVILY_API_KEY",
  "BRAVE_API_KEY",
  "BRAVE_URL",
];

function defaults(): Settings {
  return {
    apiKeys: {},
    linkedin: {},
    tools: { search: { provider: "tavily", maxResults: 10 } },
    study: {},
  };
}

// ─── Acesso cru à tabela ─────────────────────────────────────────────────────

/** Todas as linhas como um Map. Uma query — os call sites leem várias chaves. */
export async function readAll(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!isDbConfigured()) return map;
  const rows = await getDb()
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings);
  for (const r of rows) if (r.value.trim()) map.set(r.key, r.value);
  return map;
}

/** Uma chave só. Devolve undefined quando vazia — quem chama cai no .env. */
export async function readKey(key: string): Promise<string | undefined> {
  if (!isDbConfigured()) return undefined;
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  const v = row?.value?.trim();
  return v ? v : undefined;
}

/**
 * Grava um lote. Valor vazio APAGA a linha (= voltar a usar o .env), em vez de
 * gravar string vazia — assim "sem override" tem uma representação só.
 */
export async function writeKeys(
  entries: Record<string, string>,
  updatedBy: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const apagar: string[] = [];
  const gravar: (typeof appSettings.$inferInsert)[] = [];

  for (const [key, raw] of Object.entries(entries)) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      apagar.push(key);
      continue;
    }
    gravar.push({
      key,
      value,
      isSecret: isSecretKey(key),
      updatedAt: now,
      updatedBy,
    });
  }

  if (apagar.length) {
    await db.delete(appSettings).where(inArray(appSettings.key, apagar));
  }
  for (const row of gravar) {
    await db
      .insert(appSettings)
      .values(row)
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: row.value,
          isSecret: row.isSecret,
          updatedAt: now,
          updatedBy,
        },
      });
  }
}

// ─── Forma antiga (Settings), mantida para as rotas existentes ───────────────

export async function getSettings(): Promise<Settings> {
  const map = await readAll();
  const s = defaults();

  for (const k of API_KEY_NAMES) {
    const v = map.get(k);
    if (v) s.apiKeys[k] = v;
  }
  for (const [campo, key] of Object.entries(LINKEDIN_KEYS)) {
    const v = map.get(key);
    if (v) s.linkedin[campo as keyof Settings["linkedin"]] = v;
  }

  const provider = map.get(SEARCH_PROVIDER_KEY);
  if (provider === "tavily" || provider === "brave") {
    s.tools.search.provider = provider;
  }
  const max = Number(map.get(SEARCH_MAX_RESULTS_KEY));
  if (Number.isFinite(max) && max > 0) s.tools.search.maxResults = max;

  const form = map.get(STUDY_FORM_URL_KEY);
  if (form) s.study.formUrl = form;

  return s;
}

export async function saveSettings(
  next: Settings,
  updatedBy: string | null = null,
): Promise<void> {
  const entries: Record<string, string> = {};
  for (const k of API_KEY_NAMES) entries[k] = next.apiKeys[k] ?? "";
  for (const [campo, key] of Object.entries(LINKEDIN_KEYS)) {
    entries[key] = next.linkedin[campo as keyof Settings["linkedin"]] ?? "";
  }
  entries[SEARCH_PROVIDER_KEY] = next.tools.search.provider;
  entries[SEARCH_MAX_RESULTS_KEY] = String(next.tools.search.maxResults);
  entries[STUDY_FORM_URL_KEY] = next.study.formUrl ?? "";
  await writeKeys(entries, updatedBy);
}

// ─── Resolvers (app_settings → fallback .env) ────────────────────────────────

export async function resolveApiKey(
  name: ApiKeyName,
): Promise<string | undefined> {
  return (await readKey(name)) ?? process.env[name];
}

export async function resolveLinkedIn(): Promise<{
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}> {
  const map = await readAll();
  return {
    clientId: map.get(LINKEDIN_KEYS.clientId) ?? process.env.LINKEDIN_CLIENT_ID,
    clientSecret:
      map.get(LINKEDIN_KEYS.clientSecret) ?? process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri:
      map.get(LINKEDIN_KEYS.redirectUri) ?? process.env.LINKEDIN_REDIRECT_URI,
  };
}

export async function getSearchToolConfig(): Promise<{
  provider: NavigatorProvider;
  maxResults: number;
}> {
  const map = await readAll();
  const stored = map.get(SEARCH_PROVIDER_KEY);
  const provider: NavigatorProvider =
    stored === "tavily" || stored === "brave"
      ? stored
      : ((process.env.DEFAULT_NAVIGATOR as NavigatorProvider) || "tavily");
  const max = Number(map.get(SEARCH_MAX_RESULTS_KEY));
  return {
    provider,
    maxResults: Number.isFinite(max) && max > 0 ? max : 10,
  };
}
