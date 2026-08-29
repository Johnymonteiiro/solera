import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, publishedPosts, runs } from "@/db";
import { PostSize, PublishedPost, SearchLanguage } from "../types/types";

// Posts publicados no LinkedIn. Substitui data/published-posts.json.
// Um post por thread (thread_id é PK), com cascade a partir de runs.
//
// A tabela NÃO tem coluna de dono: `runs` é a fonte única de propriedade, e o
// escopo sai por innerJoin nela. Duplicar owner_id aqui daria um segundo lugar
// para a verdade divergir. `savePublishedPost` é o escritor e fica sem ownerId —
// roda dentro do publisher.node, já do outro lado da checagem.

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

export async function listPublishedPosts(
  ownerId: string,
): Promise<PublishedPost[]> {
  const rows = await getDb()
    .select({ post: publishedPosts })
    .from(publishedPosts)
    .innerJoin(runs, eq(runs.threadId, publishedPosts.threadId))
    .where(eq(runs.ownerId, ownerId))
    .orderBy(desc(publishedPosts.publishedAt));
  return rows.map((r) => toPost(r.post));
}

// Retorna o post publicado de um thread do dono (ou null).
export async function getPublishedPost(
  ownerId: string,
  threadId: string,
): Promise<PublishedPost | null> {
  const [row] = await getDb()
    .select({ post: publishedPosts })
    .from(publishedPosts)
    .innerJoin(runs, eq(runs.threadId, publishedPosts.threadId))
    .where(and(eq(publishedPosts.threadId, threadId), eq(runs.ownerId, ownerId)))
    .limit(1);
  return row ? toPost(row.post) : null;
}

// Remove o registro publicado de um thread do dono. Retorna true se removeu algo.
// (Não despublica do LinkedIn — só apaga o registro local.)
export async function deletePublishedPost(
  ownerId: string,
  threadId: string,
): Promise<boolean> {
  // DELETE não aceita join, então a posse entra como subquery em runs — mesma
  // regra do innerJoin das leituras, escrita da forma que o DELETE permite.
  const db = getDb();
  const deleted = await db
    .delete(publishedPosts)
    .where(
      and(
        eq(publishedPosts.threadId, threadId),
        inArray(
          publishedPosts.threadId,
          db
            .select({ threadId: runs.threadId })
            .from(runs)
            .where(and(eq(runs.threadId, threadId), eq(runs.ownerId, ownerId))),
        ),
      ),
    )
    .returning({ threadId: publishedPosts.threadId });
  return deleted.length > 0;
}
