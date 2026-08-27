import { AIMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { writerAgent } from "../agents/writer.agent";
import { LINKEDIN_MAX_CHARS, POST_SIZE_RANGES } from "../constants";
import { composeSystemPrompt, getAgentConfig } from "../lib/configStore";
import { DraftTrigger, recordDraftVersion } from "../lib/studyRecorder";
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
  const { topic, insights, draft: previousDraft, humanFeedback, judgement } =
    state;
  // Fallback defensivo: graphs antigos no cache podem não ter postSize.
  const postSize = state.postSize ?? "medium";
  const targetRange = POST_SIZE_RANGES[postSize];

  // Detecta tipo do retry:
  // - primeira execução: judgement vazio (score 0), sem humanFeedback
  // - mandato humano ativo: humanFeedback.decision === "reject" com comments
  // - retry do judge: judgement.score > 0 (rodou pelo menos uma vez)
  // Mandato e judge retry coexistem: o mandato persiste através do loop
  // até o usuário agir de novo (approve/stop/restart_research).
  const hasMandate =
    humanFeedback?.decision === "reject" && !!humanFeedback?.comments;
  const isFreshHumanRevision =
    hasMandate && humanFeedback!.timestamp !== state.lastAppliedFeedbackAt;
  const isJudgeRetry = judgement.score > 0;
  // HUMAN OVERRIDE no prompt sempre que o mandato existe — não só na primeira
  // passada. Sem isso, o writer "esquece" a instrução nos judge retries e
  // o judge vence (e o loop nunca acumula até MAX_JUDGE_RETRIES).
  const isHumanRevision = hasMandate;

  const threadId = config.configurable?.thread_id as string | undefined;

  // Desativado na config: passthrough (mantém draft anterior — avisado na UI).
  if (state.disabledAgents?.includes("writer")) {
    console.warn("[writer] desativado na config — pulando escrita");
    return { status: "writing" };
  }

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

  const nextStatus: "writing" | "revising" = isHumanRevision
    ? "revising"
    : "writing";

  if (threadId) {
    emitEvent(threadId, { type: nextStatus, threadId });
  }

  const insightsList = insights.map((ins, i) => `${i + 1}. ${ins}`).join("\n");

  // Contexto do draft anterior:
  // - em revisão humana, mostra como base pra correção cirúrgica
  // - em retry do judge, mostra com os issues pra o LLM corrigir as falhas
  let previousDraftBlock = "";
  if (isHumanRevision && previousDraft) {
    previousDraftBlock = `\n\nDRAFT ANTERIOR (a ser corrigido — base da reescrita):\n"""\n${previousDraft}\n"""`;
  } else if (isJudgeRetry && previousDraft) {
    const issues = judgement.issues.length
      ? judgement.issues.map((i) => `- ${i}`).join("\n")
      : "- (sem issues listados)";
    const suggestions = judgement.suggestions.length
      ? judgement.suggestions.map((s) => `- ${s}`).join("\n")
      : "";
    previousDraftBlock = `\n\nDRAFT ANTERIOR (score do judge: ${judgement.score}/10 — corrija):\n"""\n${previousDraft}\n"""\n\nPROBLEMAS APONTADOS PELO JUDGE:\n${issues}${suggestions ? `\n\nSUGESTÕES:\n${suggestions}` : ""}\n\nReescreva mantendo o que estava bom e corrigindo os problemas. ATENÇÃO ESPECIAL ao range de chars do tamanho ${targetRange.label} (${targetRange.min}-${targetRange.max}).`;
  }

  const feedbackBlock =
    isHumanRevision && humanFeedback?.comments
      ? `\n\nINSTRUÇÕES DO REVISOR HUMANO (prioridade absoluta):\n${humanFeedback.comments}\n\nReescreva o draft anterior aplicando estas instruções. Mantenha o que estava bom e corrija APENAS o que foi apontado.`
      : "";

  let prompts = writerPrompt({
    topic,
    previousDraftBlock,
    feedbackBlock,
    insightsList,
    targetRange,
  });
  // Config: injeta papel + override (prepend) mantendo o prompt dinâmico do código.
  const writerCfg = (await getAgentConfig()).writer;
  prompts = composeSystemPrompt(
    writerCfg.role,
    writerCfg.promptOverride,
    prompts,
    "prepend",
  );
  const { response } = await writerAgent({ prompts, insightsList });
  let draft = extractLastAiContent(response.messages);

  if (draft.length > LINKEDIN_MAX_CHARS) {
    console.warn(
      `[writer] Draft truncado de ${draft.length} para ${LINKEDIN_MAX_CHARS} chars`,
    );
    draft = draft.slice(0, LINKEDIN_MAX_CHARS);
  }

  console.log(
    `[writer] draft=${draft.length} chars (size=${postSize}, alvo=${targetRange.min}-${targetRange.max}, humanRevision=${isHumanRevision}, judgeRetry=${isJudgeRetry})`,
  );

  // Registro de pesquisa: grava ESTA versão antes que a próxima passada a
  // substitua no state. É o "antes" do par antes/depois — até aqui só o draft
  // final chegava ao store (via awaiting_review em hitl.node), e todo v1
  // reprovado pelo judge se perdia.
  //
  // Precedência do trigger: mandato humano fresco vence, porque o judge retry
  // herda o mandato e continuaria marcando "human_revision" para sempre.
  if (threadId) {
    const trigger: DraftTrigger = isFreshHumanRevision
      ? "human_revision"
      : isJudgeRetry
        ? "judge_retry"
        : "initial";
    await recordDraftVersion({ threadId, content: draft, trigger });
  }

  return {
    draft,
    status: nextStatus,
    // revisionCount conta cada Revisar humano (timestamp único). Judge retries
    // dentro do mesmo mandato NÃO incrementam — daí o gate por
    // isFreshHumanRevision em vez de isHumanRevision.
    revisionCount: isFreshHumanRevision ? 1 : 0,
    // judgeRetries incrementa em todo judge retry, mandato humano ou não.
    // Garante que o circuit breaker (MAX_JUDGE_RETRIES) dispare mesmo quando
    // o mandato humano contradiz uma regra do judge (ex: "inclua link").
    judgeRetries: isJudgeRetry ? (state.judgeRetries ?? 0) + 1 : 0,
    // Marca o feedback como aplicado para a próxima passada distinguir
    // revisão fresh vs judge retry dentro do mesmo mandato.
    lastAppliedFeedbackAt: isFreshHumanRevision
      ? humanFeedback!.timestamp
      : state.lastAppliedFeedbackAt,
    // humanFeedback NÃO é limpo aqui — fica persistente para o HUMAN OVERRIDE
    // do prompt continuar valendo em todos os ciclos do loop judge↔writer.
    // É substituído quando o usuário age de novo (hitl.node devolve nova
    // decisão approve/reject/stop/restart_research).
  };
}
