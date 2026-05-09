import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { NavigatorProvider } from "../types/types";
import { deduplicateAndRank, searchWeb } from "./search";

const schema = z.object({
  query: z
    .string()
    .min(3)
    .describe("The search query. Be specific — include year, industry, language if relevant."),
  language: z
    .enum(["pt-BR", "en-US"])
    .default("pt-BR")
    .describe("Language of the sources to prefer."),
});

export const searchTool = tool(
  async ({ query, language }): Promise<string> => {
    const provider = (process.env.DEFAULT_NAVIGATOR as NavigatorProvider) ?? "tavily";
    const raw = await searchWeb(query, provider, language);
    const results = deduplicateAndRank(raw);
    return JSON.stringify(results);
  },
  {
    name: "search_web",
    description:
      "Search the web for recent, relevant sources about a topic. Use this to gather material for a LinkedIn post. You can call it multiple times with refined queries if the first results are weak. Returns a JSON array of { url, title, content, relevanceScore }.",
    schema,
  },
);
