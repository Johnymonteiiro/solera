import { NavigatorOptions, ResearchResult } from "@/app/agents/types/types";


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

  const response = await fetch(
    `${process.env.BRAVE_URL}${params}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": options.apiKey,
      },
    }
  );

  if (!response.ok) throw new Error(`Brave erro: ${response.status}`);

  const data = await response.json();

  return (data.web?.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    relevanceScore: r.rating.bestRating ?? 0,
    content: r.description ?? "",
  }));
}