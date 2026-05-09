import { getGraph } from "@/app/MAS/graph/graph";
import { emitEvent } from "@/app/MAS/lib/threadStore";
import { Command } from "@langchain/langgraph";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface ReviewBody {
  threadId?: string;
  decision?: "approve" | "reject";
  comments?: string;
}

export async function POST(req: NextRequest) {
  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { threadId, decision, comments } = body;
  if (!threadId || !decision) {
    return NextResponse.json(
      { error: "threadId e decision são obrigatórios" },
      { status: 400 },
    );
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: "decision deve ser 'approve' ou 'reject'" },
      { status: 400 },
    );
  }

  const graph = getGraph();
  const feedback = {
    decision,
    comments: comments?.trim() || undefined,
    timestamp: new Date().toISOString(),
  };

  // Resume o grafo em background — o SSE em /stream/[threadId] entrega
  // os eventos seguintes (revising/critiquing/awaiting_review/publishing/done).
  void (async () => {
    try {
      await graph.invoke(new Command({ resume: feedback }), {
        configurable: { thread_id: threadId },
      });

      const snapshot = await graph.getState({
        configurable: { thread_id: threadId },
      });
      const isPaused = (snapshot?.next?.length ?? 0) > 0;
      if (!isPaused) {
        emitEvent(threadId, { type: "done", threadId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api/mas/review] thread=${threadId} falhou:`, message);
      emitEvent(threadId, {
        type: "error",
        threadId,
        payload: { error: message },
      });
    }
  })();

  return NextResponse.json({ ok: true });
}
