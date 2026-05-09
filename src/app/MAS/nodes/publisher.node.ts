import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";

export async function publisherNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;
  if (threadId) {
    emitEvent(threadId, { type: "publishing", threadId });
  }

  // Mock: integração real com LinkedIn vem depois.
  // Por enquanto gera URL determinística baseada no threadId.
  const slug = threadId?.replace(/^thread_/, "") ?? `${Date.now()}`;
  const finalPostUrl = `local://posts/${slug}`;

  console.log(
    `[publisher] post publicado em ${finalPostUrl} (${state.draft.length} chars)`,
  );

  return {
    finalPostUrl,
    status: "publishing",
  };
}
