import { AIMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { writerAgent } from "../agents/writer.agent";
import { LINKEDIN_MAX_CHARS, POST_SIZE_RANGES } from "../constants";
import { emitEvent } from "../lib/threadStore";
import { writerPrompt } from "../prompts/writer.prompt";
import { State } from "../states/states";

const MIN_INSIGHTS = 2;

function extractLastAiContent(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const lastAi = [...messages]
    .reverse()
    .find((m) => AIMessage.isInstance(m)) as AIMessage | undefined;
  return typeof lastAi?.content === "string" ? lastAi.content : "";
}

export async function writerNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { topic, insights, draft: previousDraft, humanFeedback } = state;
  // Fallback defensivo: graphs antigos no cache podem não ter postSize.
  const postSize = state.postSize ?? "medium";
  const targetRange = POST_SIZE_RANGES[postSize];

  const threadId = config.configurable?.thread_id as string | undefined;

  // Guarda: sem insights suficientes, abortar com erro em vez de gerar
  // post genérico (evita lixo passando adiante).
  if (insights.length < MIN_INSIGHTS) {
    console.error(
      `[writer] insights insuficientes (${insights.length}) — abortando`,
    );
    if (threadId) {
      emitEvent(threadId, {
        type: "error",
        threadId,
        payload: {
          error:
            "Pesquisa não retornou fontes relevantes suficientes para o tópico. Tente um tópico mais específico ou rode novamente.",
        },
      });
    }
    return { status: "error" };
  }

  const isRevision = humanFeedback?.decision === "reject";
  const nextStatus: "writing" | "revising" = isRevision ? "revising" : "writing";

  if (threadId) {
    emitEvent(threadId, { type: nextStatus, threadId });
  }

  const insightsList = insights.map((ins, i) => `${i + 1}. ${ins}`).join("\n");

  const previousDraftBlock =
    isRevision && previousDraft
      ? `\n\nDRAFT ANTERIOR (a ser corrigido — base da reescrita):\n"""\n${previousDraft}\n"""`
      : "";

  const feedbackBlock =
    isRevision && humanFeedback?.comments
      ? `\n\nINSTRUÇÕES DO REVISOR HUMANO (prioridade absoluta):\n${humanFeedback.comments}\n\nReescreva o draft anterior aplicando estas instruções. Mantenha o que estava bom e corrija APENAS o que foi apontado.`
      : "";

  const prompts = writerPrompt({
    topic,
    previousDraftBlock,
    feedbackBlock,
    insightsList,
    targetRange,
  });
  const { response } = await writerAgent({ prompts, insightsList });
  let draft = extractLastAiContent(response.messages);

  if (draft.length > LINKEDIN_MAX_CHARS) {
    console.warn(
      `[writer] Draft truncado de ${draft.length} para ${LINKEDIN_MAX_CHARS} chars`,
    );
    draft = draft.slice(0, LINKEDIN_MAX_CHARS);
  }

  console.log(
    `[writer] draft=${draft.length} chars (size=${postSize}, alvo=${targetRange.min}-${targetRange.max}, revisão=${isRevision})`,
  );

  return {
    draft,
    status: nextStatus,
    revisionCount: isRevision ? 1 : 0,
  };
}
