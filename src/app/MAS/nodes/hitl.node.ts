import { interrupt, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { MAX_JUDGE_RETRIES } from "../constants";
import { updateRunProgress } from "../lib/studyRecorder";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";
import { HumanDecision, HumanFeedback } from "../types/types";

interface ResumePayload {
  decision: HumanDecision;
  comments?: string;
  timestamp?: string;
}

const EMPTY_CRITIQUE = {
  score: 0,
  hookQuality: 0,
  originality: 0,
  scannability: 0,
  ctaQuality: 0,
  lengthAdequate: false,
  toneLinkedIn: false,
  hasEngagementBait: false,
  hasExternalLinkInBody: false,
  issues: [],
  suggestions: [],
};

export async function hitlNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;

  // Desativado na config: sem revisão humana — auto-aprova e segue pro publisher.
  if (state.disabledAgents?.includes("hitl")) {
    console.warn("[hitl] desativado na config — auto-aprovando");
    return {
      humanFeedback: {
        decision: "approve",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const isStuck = (state.judgeRetries ?? 0) >= MAX_JUDGE_RETRIES;

  if (threadId) {
    emitEvent(threadId, {
      type: "awaiting_review",
      threadId,
      payload: {
        judgement: state.judgement,
        draft: state.draft,
        revisionCount: state.revisionCount,
        judgeRetries: state.judgeRetries ?? 0,
        stuck: isStuck,
      },
    });
    // Contadores finais no registro de pesquisa. `stuck` (judgeRetries no teto)
    // marca as execuções em que o judge NUNCA aprovou — são as mais limpas do
    // estudo, porque a versão final não foi selecionada por "o judge aceitou".
    await updateRunProgress(threadId, {
      status: "awaiting_review",
      revisionCount: state.revisionCount ?? 0,
      judgeRetries: state.judgeRetries ?? 0,
    });
  }

  // Pausa o grafo até /api/mas/review chamar Command({ resume }).
  const resumed = interrupt({
    draft: state.draft,
    judgement: state.judgement,
    revisionCount: state.revisionCount,
    judgeRetries: state.judgeRetries ?? 0,
    stuck: isStuck,
  }) as ResumePayload;

  const humanFeedback: HumanFeedback = {
    decision: resumed.decision,
    comments: resumed.comments,
    timestamp: resumed.timestamp ?? new Date().toISOString(),
  };

  console.log(
    `[hitl] decisão=${humanFeedback.decision} (stuck=${isStuck}, revisões=${state.revisionCount}, judgeRetries=${state.judgeRetries ?? 0})`,
  );

  // Restart_research: zera judgement e contadores antes de voltar ao researcher,
  // pra fluxo correr novo do zero com novos insights.
  if (resumed.decision === "restart_research") {
    return {
      humanFeedback,
      judgement: EMPTY_CRITIQUE,
      judgeRetries: 0,
      draft: "",
    };
  }

  // Stop: marca status e deixa routeAfterHITL encerrar.
  if (resumed.decision === "stop") {
    return { humanFeedback, status: "stopped" };
  }

  return { humanFeedback };
}
