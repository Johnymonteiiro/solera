import { deleteCheckpoint } from "@/app/MAS/lib/checkpointer";
import { deletePublishedPost } from "@/app/MAS/lib/publishedPostsStore";
import { deleteThread } from "@/app/MAS/lib/threadStore";
import { requireArea } from "@/lib/dal";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deleta um post por completo: thread + registro publicado + checkpoint.
// Independe do status e é idempotente (não despublica do LinkedIn).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;

  const { threadId } = await params;

  // O delete do run é quem ACUSA a posse. Só depois dele o checkpoint e o
  // registro publicado podem cair — o checkpoint não conhece dono, então
  // apagá-lo antes destruiria a execução de outro contra um schema que é
  // append-only justamente para não perder o "antes" da revisão.
  const removedThread = await deleteThread(ownerId, threadId);
  if (!removedThread.ok) {
    return NextResponse.json({ ok: true, removed: false });
  }

  // published_posts cai por ON DELETE CASCADE junto com o run; a chamada
  // explícita fica como rede de segurança e é no-op no caminho normal.
  await deletePublishedPost(ownerId, threadId);
  await deleteCheckpoint(threadId);

  return NextResponse.json({ ok: true, removed: true });
}
