import { NextResponse } from "next/server";
import { listPublishedPosts } from "@/app/MAS/lib/publishedPostsStore";
import { listThreads } from "@/app/MAS/lib/threadStore";
import { AgentStatus, PostSize } from "@/app/MAS/types/types";
import { requireArea } from "@/lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uma linha da tabela de Posts = uma execução que gerou rascunho, com info de
// publicação (badge publicado/não + link do LinkedIn).
export interface PostRow {
  threadId: string;
  topic: string;
  postSize: PostSize;
  status: AgentStatus;
  createdAt: string;
  completedAt: string | null;
  judgeLoop: boolean;
  draft: string;
  published: boolean;
  publishedAt: string | null;
  finalPostUrl: string | null;
}

export async function GET() {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;

  const [threads, published] = await Promise.all([
    listThreads(ownerId),
    listPublishedPosts(ownerId),
  ]);
  const pubByThread = new Map(published.map((p) => [p.threadId, p]));

  const posts: PostRow[] = threads
    // "posts gerados" = threads que produziram rascunho OU foram publicadas
    .filter(
      (t) => (t.draft && t.draft.trim().length > 0) || pubByThread.has(t.threadId),
    )
    .map((t) => {
      const pub = pubByThread.get(t.threadId) ?? null;
      return {
        threadId: t.threadId,
        topic: t.topic,
        postSize: t.postSize,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        judgeLoop: t.judgeLoop,
        draft: pub?.draft ?? t.draft ?? "",
        published: pub != null,
        publishedAt: pub?.publishedAt ?? null,
        finalPostUrl: pub?.finalPostUrl ?? null,
      };
    });

  return NextResponse.json({ posts });
}
