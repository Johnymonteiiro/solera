import { getGraph } from "@/app/MAS/graph/graph";
import { createThread, emitEvent } from "@/app/MAS/lib/threadStore";
import { NavigatorProvider, PostSize, SearchLanguage } from "@/app/MAS/types/types";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const VALID_POST_SIZES: PostSize[] = ["small", "medium", "large"];

interface RunBody {
  topic?: string;
  navigatorProvider?: NavigatorProvider;
  language?: SearchLanguage;
  postSize?: PostSize;
}

export async function POST(req: NextRequest) {
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
    postSize = "medium",
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

  const threadId = `thread_${crypto.randomBytes(4).toString("hex")}`;
  createThread(threadId, topic); // inicializa thread no store para receber eventos do grafo
  const graph = getGraph();

  // fire-and-forget: inicia o grafo em background e emite eventos via threadStore
  void (async () => {
    try {
      emitEvent(threadId, { type: "researching", threadId });
      await graph.invoke(
        { topic, navigatorProvider, language, postSize },
        { configurable: { thread_id: threadId } },
      );

      // Se o grafo pausou em interrupt (HITL), não emite done — o /api/mas/review
      // resume e emite done quando finalizar de fato.
      const snapshot = await graph.getState({
        configurable: { thread_id: threadId },
      });
      const isPaused = (snapshot?.next?.length ?? 0) > 0;
      if (!isPaused) {
        emitEvent(threadId, { type: "done", threadId });
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
