import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
  const rows = await sql`
    select r.thread_id, r.judge_loop, r.post_size, r.status, r.judge_retries,
           d.version, d.char_count, j.score, j.rubric_hash, j.model
    from runs r
    left join draft_versions d on d.thread_id = r.thread_id
    left join judgements j on j.draft_version_id = d.id
    order by r.created_at desc`;
  for (const x of rows) {
    console.log(
      [x.thread_id.slice(0, 10), x.judge_loop ? "com" : "sem", x.post_size,
       x.status, "retries=" + x.judge_retries,
       x.version ? `v${x.version} ${x.char_count}ch` : "SEM VERSAO",
       x.score !== null ? `score ${x.score}` : "-",
       x.rubric_hash ?? "-"].join(" | "),
    );
  }
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
