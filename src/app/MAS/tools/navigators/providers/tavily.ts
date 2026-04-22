import { NavigatorOptions, ResearchResult } from "@/app/MAS/types/types";
import { tavily } from "@tavily/core";

const LANG_CONFIG: Record<string, { country: string; includeDomains: string[] }> = {
  "pt-BR": {
    country: "brazil",
    includeDomains: [".com.br", ".pt"],
  },
  "en-US": {
    country: "united states",
    includeDomains: [],
  },
};

export async function searchTavily(options: NavigatorOptions): Promise<ResearchResult[]> {
  if (!options.query) throw new Error("Tavily requer 'query'.");
  if (!options.apiKey) throw new Error("Tavily requer 'apiKey'.");

  const langConfig = options.language ? LANG_CONFIG[options.language] : LANG_CONFIG["pt-BR"];

  const client = tavily({ apiKey: options.apiKey });
  const response = await client.search(options.query, {
    maxResults: options.maxResults ?? 5,
    country: langConfig.country,
    ...(langConfig.includeDomains.length > 0 && {
      includeDomains: langConfig.includeDomains,
    }),
  });

  return response.results.map((r) => ({
    title: r.title,
    url: r.url,
    relevanceScore: r.score,
    content: r.content,
  }));
}