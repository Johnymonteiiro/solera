import { GRAPH_RECURSION_LIMIT } from "@/app/MAS/constants";
import { getGraph } from "@/app/MAS/graph/graph";
import { flushCheckpointer } from "@/app/MAS/lib/checkpointer";
import { AGENT_IDS, getAgentConfig } from "@/app/MAS/lib/configStore";
import { createThread, emitEvent } from "@/app/MAS/lib/threadStore";
import { NavigatorProvider, PostSize, SearchLanguage } from "@/app/MAS/types/types";
import { requireArea } from "@/lib/dal";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const VALID_POST_SIZES: PostSize[] = ["small", "medium", "large"];

interface RunBody {
  topic?: string;
  navigatorProvider?: NavigatorProvider;
  language?: SearchLanguage;
  postSize?: PostSize;
  // Condição do estudo, por execução. Omitido → cai no default global
  // (judge.enabled em /agentes). O estudo alterna com/sem judge no MESMO
  // tópico, então precisa decidir isto por run, não numa config global.
  judgeLoop?: boolean;
}

export async function POST(req: NextRequest) {
  // Antes de qualquer coisa: um run queima crédito de LLM do dono da chave.
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;

  let body: RunBody;
  try {
    body = (await req.json()) as RunBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    topic,
    navigatorProvider = "tavily",
    language = "pt-BR",
    postSize = "small",
  } = body;
  if (!topic || topic.trim().length < 10) {
    return NextResponse.json(
      { error: "topic é obrigatório e precisa ter no mínimo 10 caracteres" },
      { status: 400 },
    );
  }
  if (!VALID_POST_SIZES.includes(postSize)) {
    return NextResponse.json(
      { error: "postSize inválido. Use 'small', 'medium' ou 'large'." },
      { status: 400 },
    );
  }

  // Config dos agentes (/agentes) define quais agentes estão desativados e o
  // default do judgeLoop. O corpo da requisição sobrepõe por execução — é o
  // toggle do card de criar post, que a coleta do estudo usa para alternar as
  // condições sem depender de mexer numa config global entre um run e outro.
  const agentConfig = await getAgentConfig();
  const judgeLoop =
    typeof body.judgeLoop === "boolean"
      ? body.judgeLoop
      : agentConfig.judge.enabled;
  const disabledAgents = AGENT_IDS.filter(
    (id) => id !== "judge" && !agentConfig[id].enabled,
  );

  const threadId = `thread_${crypto.randomBytes(4).toString("hex")}`;
  // Awaited de propósito: draft_versions referencia runs.thread_id, então a
  // linha do run tem que existir antes de o writer gravar a v1.
  const created = await createThread(ownerId, threadId, topic, postSize, judgeLoop);
  if (!created) {
    // threadId é aleatório, então isto é colisão praticamente impossível — mas
    // seguir em frente penduraria as versões deste run na linha de outro dono.
    return NextResponse.json({ error: "thread_conflict" }, { status: 409 });
  }
  const graph = getGraph();

  // fire-and-forget: inicia o grafo em background e emite eventos via threadStore
  void (async () => {
    try {
      emitEvent(threadId, { type: "researching", threadId });
      await graph.invoke(
        {
          topic,
          navigatorProvider,
          language,
          postSize,
          judgeLoop,
          disabledAgents,
        },
        {
          configurable: { thread_id: threadId },
          recursionLimit: GRAPH_RECURSION_LIMIT,
        },
      );

      // Se o grafo pausou em interrupt (HITL), não emite done — o /api/mas/review
      // resume e emite done quando finalizar de fato.
      const snapshot = await graph.getState({
        configurable: { thread_id: threadId },
      });
      const isPaused = (snapshot?.next?.length ?? 0) > 0;
      // Garante que o checkpoint (pausa no HITL ou fim) esteja em disco já.
      flushCheckpointer();
      if (!isPaused) {
        // O pipeline pode ter abortado: researcher sem fontes (stopped) ou
        // writer sem insights (error). Propaga o status real — senão a UI
        // marcaria "done" mesmo com agentes que nem rodaram.
        const v = snapshot?.values?.status;
        const finalStatus =
          v === "stopped" ? "stopped" : v === "error" ? "error" : "done";
        const stoppedReason = snapshot?.values?.stoppedReason ?? undefined;
        emitEvent(threadId, {
          type: finalStatus,
          threadId,
          payload: stoppedReason ? { stoppedReason } : undefined,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api/mas/run] thread=${threadId} falhou:`, message);
      emitEvent(threadId, {
        type: "error",
        threadId,
        payload: { error: message },
      });
    }
  })();

  return NextResponse.json({ threadId });
}
