import { asc, eq } from "drizzle-orm";
import { getDb, isDbConfigured, llmModels } from "@/db";
import { FALLBACK_WRITER_MODEL } from "../models/openAI/models";

// Catálogo de modelos do Writer (tabela `llm_models`, tela /modelos).
//
// Sem cache, ao contrário de settings/agent_configs: o modelo do Writer é lido
// UMA vez por execução, na rota que cria o run, e gravado em `runs.writer_model`.
// Dali em diante o grafo lê do estado da execução, não daqui — trocar o default
// no meio de um run não muda o modelo de quem já começou.

export interface LlmModel {
  id: string;
  label: string;
  isDefault: boolean;
}

/** Slug do OpenRouter: `<provedor>/<modelo>`, sem espaço. */
const SLUG_RE = /^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/;

export function isValidSlug(id: string): boolean {
  return SLUG_RE.test(id);
}

export async function listModels(): Promise<LlmModel[]> {
  if (!isDbConfigured()) {
    return [{ id: FALLBACK_WRITER_MODEL, label: FALLBACK_WRITER_MODEL, isDefault: true }];
  }
  return getDb()
    .select({ id: llmModels.id, label: llmModels.label, isDefault: llmModels.isDefault })
    .from(llmModels)
    .orderBy(asc(llmModels.createdAt), asc(llmModels.id));
}

/** Modelo do Writer quando a execução não pede um. Sem linha default → fallback do código. */
export async function getDefaultWriterModel(): Promise<string> {
  const models = await listModels();
  return models.find((m) => m.isDefault)?.id ?? FALLBACK_WRITER_MODEL;
}

export async function modelExists(id: string): Promise<boolean> {
  return (await listModels()).some((m) => m.id === id);
}

/**
 * Troca o default numa transação: desmarca todos e marca um. Em dois passos
 * porque o índice único parcial recusaria duas linhas `true` ao mesmo tempo.
 */
export async function setDefaultModel(id: string, updatedBy: string | null): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [alvo] = await tx.select({ id: llmModels.id }).from(llmModels).where(eq(llmModels.id, id));
    if (!alvo) return false;
    const now = new Date();
    await tx
      .update(llmModels)
      .set({ isDefault: false, updatedAt: now, updatedBy })
      .where(eq(llmModels.isDefault, true));
    await tx
      .update(llmModels)
      .set({ isDefault: true, updatedAt: now, updatedBy })
      .where(eq(llmModels.id, id));
    return true;
  });
}

export async function addModel(id: string, label: string, updatedBy: string | null): Promise<boolean> {
  const now = new Date();
  const rows = await getDb()
    .insert(llmModels)
    .values({ id, label, isDefault: false, createdAt: now, updatedAt: now, updatedBy })
    .onConflictDoNothing()
    .returning({ id: llmModels.id });
  return rows.length > 0;
}

/**
 * Remove um modelo do catálogo. O default não pode sair (o Writer ficaria sem
 * modelo). Execuções antigas não são afetadas: guardam o slug em `runs.writer_model`.
 */
export async function removeModel(id: string): Promise<"ok" | "not_found" | "is_default"> {
  const db = getDb();
  const [row] = await db
    .select({ isDefault: llmModels.isDefault })
    .from(llmModels)
    .where(eq(llmModels.id, id));
  if (!row) return "not_found";
  if (row.isDefault) return "is_default";
  await db.delete(llmModels).where(eq(llmModels.id, id));
  return "ok";
}
