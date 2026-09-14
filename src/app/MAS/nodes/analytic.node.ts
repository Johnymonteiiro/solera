import { AIMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { makeAnalystAgent } from "../agents/analyst.agent";
import { getAgentConfig } from "../lib/configStore";
import { emitEvent } from "../lib/threadStore";
import { State } from "../states/states";
import { ResearchResult } from "../types/types";

/**
 * Quanto de cada fonte o analyst enxerga.
 *
 * Era 500 — e isso sozinho explicava boa parte dos insights genéricos. Medido
 * em 2026-08-29 sobre a coleta real: 10 fontes somando ~17.000 chars, das quais
 * o analyst via 4.660 (27%). Pior: os primeiros 500 chars de um artigo são a
 * ABERTURA, que é onde mora o enquadramento institucional. Os números, os casos
 * nomeados e as ressalvas aparecem depois — exatamente o material que o writer
 * não consegue inventar e sem o qual todo post sai igual.
 *
 * 2000 cobre praticamente toda fonte observada (a maior tinha 2.320 chars).
 * O custo é ~5k tokens de entrada por execução: irrelevante perto de gerar um
 * post que ninguém lembra.
 */
const MAX_CHARACTERS = 2000;
const MIN_RELEVANT_SOURCES = 2;

function formatPayloadForAnalyst(
  topic: string,
  results: ResearchResult[],
): string {
  if (results.length === 0) {
    return `TÓPICO: ${topic}\n\nFONTES: (nenhuma fonte coletada)`;
  }
  const sources = results
    .map((r, i) => {
      const snippet = r.content.slice(0, MAX_CHARACTERS);
      return `[${i + 1}] ${r.title}\nURL: ${r.url}\n${snippet}`;
    })
    .join("\n\n");

  return `TÓPICO: ${topic}\n\nFONTES:\n${sources}`;
}

interface AnalystOutput {
  filtered?: unknown;
  discarded?: unknown;
  insights?: unknown;
}

export async function analystNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const threadId = config.configurable?.thread_id as string | undefined;
  if (threadId) {
    emitEvent(threadId, { type: "analyzing", threadId });
  }

  // Desativado na config: passthrough (sem insights — pipeline pode quebrar, avisado).
  if (state.disabledAgents?.includes("analyst")) {
    console.warn("[analyst] desativado na config — sem insights");
    return { insights: [], status: "analyzing" };
  }

  const cfg = await getAgentConfig();
  // O idioma vem do state (escolha da UI) e decide em que língua os insights
  // saem — o writer escreve na mesma, sem traduzir no ato de escrever.
  const analystAgent = await makeAnalystAgent(
    cfg.analyst.role,
    cfg.analyst.promptOverride,
    state.language,
  );
  const payload = formatPayloadForAnalyst(state.topic, state.researchResults);
  const result = await analystAgent.invoke({
    messages: [{ role: "user", content: payload }],
  });

  const lastAi = [...(result.messages ?? [])]
    .reverse()
    .find((m) => AIMessage.isInstance(m)) as AIMessage | undefined;
  const raw = typeof lastAi?.content === "string" ? lastAi.content : "";

  let insights: string[] = [];
  // null = o modelo não declarou `filtered`. Distinto de 0 ("declarou nenhuma"):
  // sem a declaração não dá para CERTIFICAR a execução como pesquisa completa,
  // e o silêncio é justamente o modo de falha que esta guarda existe para pegar.
  let filteredCount: number | null = null;
  let discardedCount = 0;

  try {
    // O modelo às vezes embrulha o JSON em ```json ... ``` (cercas markdown).
    // Extrai o primeiro objeto {...} antes de parsear — senão JSON.parse quebra
    // e o pipeline aborta por "0 insights".
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("nenhum objeto JSON no content");
    const parsed = JSON.parse(jsonMatch[0]) as AnalystOutput;
    if (Array.isArray(parsed.insights)) {
      insights = parsed.insights.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
    }
    if (Array.isArray(parsed.filtered)) filteredCount = parsed.filtered.length;
    if (Array.isArray(parsed.discarded))
      discardedCount = parsed.discarded.length;
  } catch {
    console.warn(`[analyst] parse falhou — content=${raw.slice(0, 200)}`);
  }

  console.log(
    `[analyst] descartou ${discardedCount} fontes, manteve ${filteredCount ?? "(não declarado)"}, ` +
      `extraiu ${insights.length} insights`,
  );

  // ─── Guarda de suficiência da pesquisa ──────────────────────────────────────
  //
  // O contrato está no prompt (<step_1_filtering>): com menos de 2 fontes
  // relevantes o analyst deve devolver `insights: []` para o pipeline abortar.
  // O modelo NÃO cumpre isso de forma confiável. Medido em 2026-08-29:
  // "descartou 9 fontes, manteve 1, extraiu 3 insights" — e o post foi escrito e
  // APROVADO pelo judge em cima de uma única fonte.
  //
  // A guarda anterior checava `insights.length`, que é a quantidade errada: três
  // insights extraídos de uma fonte só passam por ela sem ruído nenhum. Quem
  // decide é a contagem de fontes RELEVANTES — o número que o prompt manda
  // contar e que o próprio modelo declara em `filtered`.
  //
  // POR QUE ABORTA EM VEZ DE AVISAR. Uma execução dessas é a condição "pesquisa
  // rala" entrando no corpus SEM rótulo, e contamina o braço de controle do
  // estudo, que precisa ser "pesquisa completa". Zerando os insights aqui, a
  // guarda do writer (writer.node.ts:58) aborta a execução; ela fica sem draft;
  // e a regra do corpus já exclui execução sem versão (`sem_versao`). O efeito é
  // uma garantia por construção: **todo run que produz draft teve ≥ 2 fontes
  // relevantes** — sem precisar de coluna nova nem de auditoria depois.
  //
  // Um aviso no console não daria isso: ele já existia, já disparou, e as
  // execuções entraram no corpus assim mesmo.
  if (filteredCount === null || filteredCount < MIN_RELEVANT_SOURCES) {
    const motivo =
      filteredCount === null
        ? "o analyst não declarou `filtered` (saída fora do contrato)"
        : `apenas ${filteredCount} fonte(s) relevante(s), mínimo ${MIN_RELEVANT_SOURCES}`;
    console.error(
      `[analyst] pesquisa insuficiente — ${motivo}. Descartando ` +
        `${insights.length} insight(s) e abortando a execução.`,
    );
    return { insights: [], status: "analyzing" };
  }

  // Persiste os insights no threadStore (via payload) para sobreviverem a
  // restart mesmo se o checkpoint for perdido — igual judgement/draft.
  if (threadId && insights.length) {
    emitEvent(threadId, { type: "analyzing", threadId, payload: { insights } });
  }

  return {
    insights,
    status: "analyzing",
  };
}
