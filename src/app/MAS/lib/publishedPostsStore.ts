import { desc, eq } from "drizzle-orm";
import { getDb, publishedPosts } from "@/db";
import { PostSize, PublishedPost, SearchLanguage } from "../types/types";

// Posts publicados no LinkedIn. Substitui data/published-posts.json.
// Um post por thread (thread_id é PK), com cascade a partir de runs.

function toPost(row: typeof publishedPosts.$inferSelect): PublishedPost {
  return {
    threadId: row.threadId,
    topic: row.topic,
    draft: row.draft,
    finalPostUrl: row.finalPostUrl,
    language: row.language as SearchLanguage,
    postSize: row.postSize as PostSize,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function savePublishedPost(post: PublishedPost): Promise<void> {
  await getDb()
    .insert(publishedPosts)
    .values({
      threadId: post.threadId,
      topic: post.topic,
      draft: post.draft,
      finalPostUrl: post.finalPostUrl,
      language: post.language,
      postSize: post.postSize,
      publishedAt: new Date(post.publishedAt),
    })
    // Republicar o mesmo thread atualiza no lugar — antes o unshift no array
    // deixava duas linhas e o find() pegava a mais recente por sorte da ordem.
    .onConflictDoUpdate({
      target: publishedPosts.threadId,
      set: {
        draft: post.draft,
        finalPostUrl: post.finalPostUrl,
        publishedAt: new Date(post.publishedAt),
      },
    });
}

export async function listPublishedPosts(): Promise<PublishedPost[]> {
  const rows = await getDb()
    .select()
    .from(publishedPosts)
    .orderBy(desc(publishedPosts.publishedAt));
  return rows.map(toPost);
}

// Retorna o post publicado de um thread (ou null se não foi publicado).
export async function getPublishedPost(
  threadId: string,
): Promise<PublishedPost | null> {
  const [row] = await getDb()
    .select()
    .from(publishedPosts)
    .where(eq(publishedPosts.threadId, threadId))
    .limit(1);
  return row ? toPost(row) : null;
}

// Remove o registro publicado de um thread. Retorna true se removeu algo.
export async function deletePublishedPost(threadId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(publishedPosts)
    .where(eq(publishedPosts.threadId, threadId))
    .returning({ threadId: publishedPosts.threadId });
  return deleted.length > 0;
}
