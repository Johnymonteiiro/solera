import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/app/MAS/graph/graph";
import { getThread } from "@/app/MAS/lib/threadStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const graph = getGraph();

  const snapshot = await graph.getState({
    configurable: { thread_id: threadId },
  });

  const values = snapshot?.values ?? {};

  // Fallback: quando o checkpoint está vazio/perdido (ex: thread antigo após
  // restart), completa os artefatos com o que foi espelhado no threadStore.
  // Sem isso, insights/researchResults sumiam pois só viviam no checkpoint.
  const stored = await getThread(threadId);
  const nonEmpty = <T>(v: T[] | undefined): T[] | undefined =>
    v && v.length > 0 ? v : undefined;

  return NextResponse.json({
    threadId,
    // Status do threadStore tem prioridade: ele reflete o ciclo de eventos ao
    // vivo (inclui awaiting_review). O checkpoint fica em "judging" quando o
    // HITL está pausado no interrupt (o nó ainda não retornou estado).
    status: stored?.status ?? values.status ?? "idle",
    researchResults:
      nonEmpty(values.researchResults) ?? stored?.researchResults ?? [],
    insights: nonEmpty(values.insights) ?? stored?.insights ?? [],
    draft: values.draft || stored?.draft || "",
    judgement: values.judgement ?? stored?.judgement ?? null,
    humanFeedback: values.humanFeedback ?? null,
    revisionCount: values.revisionCount ?? stored?.revisionCount ?? 0,
    judgeRetries: values.judgeRetries ?? stored?.judgeRetries ?? 0,
    stoppedReason: values.stoppedReason ?? null,
    postSize: values.postSize ?? stored?.postSize ?? "medium",
    finalPostUrl: values.finalPostUrl ?? null,
  });
}
