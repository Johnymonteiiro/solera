import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emitEvent } from "../lib/threadStore";
import { savePublishedPost } from "../lib/publishedPostsStore";
import { State } from "../states/states";
import { publishPost } from "../tools/linkedin";

export async function publisherNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;
  const accessToken = config.configurable?.accessToken as string | undefined;

  // Desativado na config: não publica no LinkedIn — encerra com o rascunho pronto.
  if (state.disabledAgents?.includes("publisher")) {
    console.warn("[publisher] desativado na config — não publicando");
    return { status: "done" };
  }

  if (threadId) {
    emitEvent(threadId, { type: "publishing", threadId });
  }

  if (!accessToken) {
    throw new Error(
      "Sessão LinkedIn ausente. Faça login em /login antes de publicar.",
    );
  }

  const finalPostUrl = await publishPost(state.draft, accessToken);

  await savePublishedPost({
    threadId: threadId ?? `anon_${Date.now()}`,
    topic: state.topic,
    draft: state.draft,
    finalPostUrl,
    language: state.language,
    postSize: state.postSize ?? "medium",
    publishedAt: new Date().toISOString(),
  });

  console.log(
    `[publisher] publicado em ${finalPostUrl} (${state.draft.length} chars)`,
  );

  return {
    finalPostUrl,
    status: "publishing",
  };
}
