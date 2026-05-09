import { interrupt, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";
import { HumanFeedback } from "../types/types";

interface ResumePayload {
  decision: "approve" | "reject";
  comments?: string;
  timestamp?: string;
}

export async function hitlNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;
  if (threadId) {
    emitEvent(threadId, { type: "awaiting_review", threadId });
  }

  // Pausa o grafo até /api/mas/review chamar Command({ resume }).
  // O payload abaixo fica acessível via graph.getState().tasks[].interrupts —
  // mas o frontend lê draft/critique do /api/mas/state, então não dependemos disso.
  const resumed = interrupt({
    draft: state.draft,
    critique: state.critique,
    revisionCount: state.revisionCount,
  }) as ResumePayload;

  const humanFeedback: HumanFeedback = {
    decision: resumed.decision,
    comments: resumed.comments,
    timestamp: resumed.timestamp ?? new Date().toISOString(),
  };

  console.log(
    `[hitl] decisão=${humanFeedback.decision} (revisões=${state.revisionCount})`,
  );

  return { humanFeedback };
}
