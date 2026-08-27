import { deleteCheckpoint } from "@/app/MAS/lib/checkpointer";
import { deletePublishedPost } from "@/app/MAS/lib/publishedPostsStore";
import { deleteThread } from "@/app/MAS/lib/threadStore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deleta um post por completo: thread + registro publicado + checkpoint.
// Independe do status e é idempotente (não despublica do LinkedIn).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  const removedThread = await deleteThread(threadId);
  const removedPublished = await deletePublishedPost(threadId);
  await deleteCheckpoint(threadId);

  const removed = removedThread.ok || removedPublished;
  return NextResponse.json({ ok: true, removed });
}
