"use server";

import { searchWeb } from "@/app/agents/tools/search";
import { NavigatorProvider, ResearchResult, SearchLanguage } from "@/app/agents/types/types";

export async function searchWebAction(
  query: string,
  provider: NavigatorProvider,
  language: SearchLanguage = "pt-BR",
): Promise<{ results: ResearchResult[]; error?: never } | { results?: never; error: string }> {
  try {
    const results = await searchWeb(query, provider, language);
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
