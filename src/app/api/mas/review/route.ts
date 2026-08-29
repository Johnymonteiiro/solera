import { GRAPH_RECURSION_LIMIT } from "@/app/MAS/constants";
import { getGraph } from "@/app/MAS/graph/graph";
import { flushCheckpointer } from "@/app/MAS/lib/checkpointer";
import { emitEvent, getThread } from "@/app/MAS/lib/threadStore";
import { HumanDecision } from "@/app/MAS/types/types";
import { requireArea } from "@/lib/dal";
import { getSession } from "@/lib/sessions";
import { Command } from "@langchain/langgraph";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const VALID_DECISIONS: HumanDecision[] = [
  "approve",
  "reject",
  "restart_research",
  "stop",
];

interface ReviewBody {
  threadId?: string;
  decision?: HumanDecision;
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
  if (!VALID_DECISIONS.includes(decision)) {
    return NextResponse.json(
      {
        error: `decision deve ser uma de: ${VALID_DECISIONS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Pra approve, precisamos do access token do LinkedIn (publisher vai usar).
  // Lê a sessão AGORA, antes do background async, porque cookies() depende
  // do request context que se perde após o response retornar.
  const session = await getSession();
  if (!session?.linkedinId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Revisar/publicar é área `posts` na matriz — a sessão dá a identidade e o
  // accessToken, a matriz diz se esta pessoa pode agir sobre posts.
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  // O token só é exigido no approve — reject/restart/stop retomam o grafo sem
  // chegar ao publisher.
  if (decision === "approve" && !session.accessToken) {
    return NextResponse.json(
      { error: "Sessão LinkedIn ausente. Faça login em /login antes de publicar." },
      { status: 401 },
    );
  }

  // POSSE ANTES DO GRAFO. É a rota mais perigosa do conjunto: com
  // `decision: "approve"` ela publica o rascunho do threadId informado usando o
  // accessToken de QUEM CLICOU — sem esta checagem, o post de um usuário sai na
  // conta de outro.
  if (!(await getThread(session.linkedinId, threadId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const accessToken = session.accessToken;

  const graph = getGraph();
  const feedback = {
    decision,
    comments: comments?.trim() || undefined,
    timestamp: new Date().toISOString(),
  };

  // Resume o grafo em background — o SSE em /stream/[threadId] entrega
  // os eventos seguintes (revising/judging/awaiting_review/publishing/done).
  void (async () => {
    try {
      await graph.invoke(new Command({ resume: feedback }), {
        configurable: { thread_id: threadId, accessToken },
        recursionLimit: GRAPH_RECURSION_LIMIT,
      });

      const snapshot = await graph.getState({
        configurable: { thread_id: threadId },
      });
      const isPaused = (snapshot?.next?.length ?? 0) > 0;
      flushCheckpointer();
      if (!isPaused) {
        // Se o usuário cancelou no HITL, status final é "stopped" e o publisher
        // não rodou — emitir "done" faria a UI marcar todos os agentes (inclusive
        // publisher) como concluídos, o que é mentira. Propagar o status real.
        const finalStatus = snapshot?.values?.status === "stopped"
          ? "stopped"
          : "done";
        emitEvent(threadId, { type: finalStatus, threadId });
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
