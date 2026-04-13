// Navigation types

export type NavigatorProvider = "tavily" | "brave";
export type SearchLanguage = "pt-BR" | "en-US";

export interface NavigatorOptions {
  query?: string;
  apiKey?: string;
  maxResults?: number;
  language?: SearchLanguage;
}

export interface ResearchResult {
  url: string;
  title: string;
  content: string; // conteúdo completo da página, se disponível
  relevanceScore: number; // pontuação de relevância da página para a consulta, por exemplo, de 0 a 1
}