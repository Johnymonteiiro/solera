import { NavigatorProvider, ResearchResult, SearchLanguage } from "../types/types";
import { navigator } from "./navigators/navigators";

export async function searchWeb(
  query: string,
  navigatorProvider: NavigatorProvider,
  language: SearchLanguage = "pt-BR",
): Promise<ResearchResult[]> {
  const apiKey = process.env[navigatorProvider === "tavily" ? "TAVILY_API_KEY" : "BRAVE_API_KEY"];
  if (!apiKey) {
    throw new Error(`API key para ${navigatorProvider} não encontrada. Por favor, defina a variável de ambiente correspondente.`);
  }
  return navigator(navigatorProvider, {
    query,
    maxResults: 5,
    apiKey,
    language,
  });
}

// ─── Deduplicação por URL ─────────────────────────────────────────────────────
export function deduplicateAndRank(results: ResearchResult[]): ResearchResult[] {
  const seen = new Set<string>();
  return results
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);
}