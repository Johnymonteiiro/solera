import { NavigatorOptions, ResearchResult } from "@/app/MAS/types/types";
import { tavily } from "@tavily/core";

// Domínios bloqueados — plataformas de venda de curso, marketplaces de afiliação,
// listagens promocionais que poluem buscas técnicas.
const EXCLUDE_DOMAINS = [
  "hotmart.com",
  "eduzz.com",
  "kiwify.com",
  "kiwify.com.br",
  "monetizze.com.br",
  "sympla.com.br",
  "udemy.com",
  "alura.com.br",
  "rocketseat.com.br",
  "cod3r.com.br",
  "cod3r.com",
  "origamid.com",
  "b7web.com.br",
  "fullcycle.com.br",
  "treinaweb.com.br",
];

export async function searchTavily(
  options: NavigatorOptions,
): Promise<ResearchResult[]> {
  if (!options.query) throw new Error("Tavily requer 'query'.");
  if (!options.apiKey) throw new Error("Tavily requer 'apiKey'.");

  const client = tavily({ apiKey: options.apiKey });
  const response = await client.search(options.query, {
    searchDepth: "advanced",
    chunksPerSource: 3,
    maxResults: options.maxResults ?? 10,
    topic: "general",
    timeRange: "year",
    includeAnswer: "advanced",
    autoParameters: true,
    excludeDomains: EXCLUDE_DOMAINS,
  });

  return response.results.map((r) => ({
    title: r.title,
    url: r.url,
    relevanceScore: r.score,
    content: r.content,
  }));
}
