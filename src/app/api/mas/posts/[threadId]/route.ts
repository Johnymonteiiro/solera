import { NextRequest, NextResponse } from "next/server";
import { getPublishedPost } from "@/app/MAS/lib/publishedPostsStore";
import { getThread } from "@/app/MAS/lib/threadStore";
import { requireArea } from "@/lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalhe de um post/execução: metadados do thread + info de publicação.
// Os artefatos por agente (insights, judgement, draft...) vêm de /api/mas/state/[threadId].
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;

  const { threadId } = await params;
  const [thread, pub] = await Promise.all([
    getThread(ownerId, threadId),
    getPublishedPost(ownerId, threadId),
  ]);

  if (!thread && !pub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    threadId,
    topic: thread?.topic ?? pub?.topic ?? "",
    postSize: thread?.postSize ?? pub?.postSize ?? "medium",
    status: thread?.status ?? "done",
    createdAt: thread?.createdAt ?? null,
    completedAt: thread?.completedAt ?? null,
    judgeLoop: thread?.judgeLoop ?? true,
    draft: pub?.draft ?? thread?.draft ?? "",
    published: pub != null,
    publishedAt: pub?.publishedAt ?? null,
    finalPostUrl: pub?.finalPostUrl ?? null,
    language: pub?.language ?? null,
  });
}
