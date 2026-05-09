import { AIMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import z from "zod";
import { criticAgent } from "../agents/critic.agent";
import { emitEvent } from "../lib/threadStore";
import { criticPrompt } from "../prompts/critic.prompt";
import { State } from "../states/states";

const CritiqueSchema = z.object({
  score: z.number().min(0).max(10),
  hookQuality: z.number().min(0).max(10),
  lengthAdequate: z.boolean(),
  toneLinkedIn: z.boolean(),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

function extractLastAiContent(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const lastAi = [...messages]
    .reverse()
    .find((m) => AIMessage.isInstance(m)) as AIMessage | undefined;
  return typeof lastAi?.content === "string" ? lastAi.content : "";
}

export async function criticNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { topic, draft, postSize } = state;

  const threadId = config.configurable?.thread_id as string | undefined;
  if (threadId) {
    emitEvent(threadId, { type: "critiquing", threadId });
  }

  const prompts = criticPrompt({ topic, draft, postSize });

  let attempts = 0;
  while (attempts < 2) {
    try {
      const { response } = await criticAgent({ prompts, draft });
      const content = extractLastAiContent(response.messages);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(
          `JSON não encontrado no content (${content.slice(0, 200)})`,
        );
      }

      const critique = CritiqueSchema.parse(JSON.parse(jsonMatch[0]));
      console.log(`[critic] score=${critique.score}/10`);
      return {
        critique,
        status: "critiquing",
      };
    } catch (err) {
      attempts++;
      if (attempts >= 2) {
        console.error("[critic] Falha ao parsear critique:", err);
        return { status: "error" };
      }
    }
  }

  return { status: "error" };
}
