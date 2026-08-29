import { listThreads, getThread } from "../src/app/MAS/lib/threadStore";
import { listPublishedPosts } from "../src/app/MAS/lib/publishedPostsStore";
import { ownerFromEnv } from "./owner";

async function main() {
  const ownerId = ownerFromEnv();
  const all = await listThreads(ownerId);
  console.log(`listThreads(): ${all.length} execuções`);
  for (const t of all.slice(0, 6)) {
    console.log(
      ` ${t.threadId.slice(0, 10)} | ${t.judgeLoop ? "com" : "sem"} | ${t.status}` +
        ` | draft ${t.draft ? t.draft.length + "ch" : "null"}` +
        ` | score ${t.judgement?.score ?? "-"}` +
        ` | rubric ${t.judgeMeta?.rubricHash ?? "-"}`,
    );
  }
  const withDraft = all.filter((t) => t.draft);
  console.log(`\ncom draft: ${withDraft.length} (esperado 4)`);
  console.log(`com judgement: ${all.filter((t) => t.judgement).length} (esperado 4)`);

  const one = withDraft[0];
  if (one) {
    const g = await getThread(ownerId, one.threadId);
    console.log(
      `\ngetThread(${one.threadId.slice(0, 10)}): draft ${g?.draft?.length}ch, ` +
        `score ${g?.judgement?.score}, retries ${g?.judgeRetries}`,
    );
  }
  console.log(`\nlistPublishedPosts(): ${(await listPublishedPosts(ownerId)).length}`);
  process.exit(0);
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
