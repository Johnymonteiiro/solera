import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/app/MAS/graph/graph";

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
  return NextResponse.json({
    threadId,
    status: values.status ?? "idle",
    researchResults: values.researchResults ?? [],
    insights: values.insights ?? [],
    draft: values.draft ?? "",
    critique: values.critique ?? null,
    humanFeedback: values.humanFeedback ?? null,
    revisionCount: values.revisionCount ?? 0,
    postSize: values.postSize ?? "medium",
    finalPostUrl: values.finalPostUrl ?? null,
  });
}
