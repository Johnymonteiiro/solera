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