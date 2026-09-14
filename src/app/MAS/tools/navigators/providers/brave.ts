import { SEARCH_TIMEOUT_MS } from "@/app/MAS/constants";
import { resolveApiKey } from "@/app/MAS/lib/settingsStore";
import { NavigatorOptions, ResearchResult } from "@/app/MAS/types/types";


export async function searchBrave(options: NavigatorOptions): Promise<ResearchResult[]> {
  if (!options.query) throw new Error("Brave requer 'query'.");
  if (!options.apiKey) throw new Error("Brave requer 'apiKey'.");

  const lang = options.language === "en-US" ? "en" : "pt";
  const country = options.language === "en-US" ? "us" : "br";

  const params = new URLSearchParams({
    q: options.query,
    count: String(options.maxResults ?? 5),
    type: "search",
    search_lang: lang,
    country,
  });

  const braveUrl =
    (await resolveApiKey("BRAVE_URL")) ?? "https://api.search.brave.com/res/v1/web/search?";
  // AbortSignal fecha a conexão de verdade (o race do dispatcher só desiste de
  // esperar). Sem isto, uma resposta que nunca chega prende o researcher.
  let response: Response;
  try {
    response = await fetch(`${braveUrl}${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": options.apiKey,
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Brave não respondeu em ${SEARCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }

  if (!response.ok) throw new Error(`Brave erro: ${response.status}`);

  const data = await response.json();

  return (data.web?.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    relevanceScore: r.rating.bestRating ?? 0,
    content: r.description ?? "",
  }));
}