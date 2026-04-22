import { NavigatorOptions, NavigatorProvider, ResearchResult } from "../../types/types";
import { searchBrave, searchTavily } from "./providers";

const handlers: Record<
  NavigatorProvider,
  (options: NavigatorOptions) => Promise<ResearchResult[]>
> = {
  tavily: searchTavily,
  brave: searchBrave,
};

export async function navigator(
  provider: NavigatorProvider,
  options: NavigatorOptions
): Promise<ResearchResult[]> {
  const handler = handlers[provider];
  if (!handler) throw new Error(`Provider "${provider}" não suportado.`);
  return handler(options);
}

export type { NavigatorOptions, NavigatorProvider, ResearchResult };

