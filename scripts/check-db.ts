import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' order by table_name`;
  console.log("tabelas:", tables.map((t) => t.table_name).join(", ") || "(nenhuma)");
  for (const t of ["runs", "draft_versions", "judgements", "human_ratings"]) {
    if (!tables.some((x) => x.table_name === t)) continue;
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`  ${t}: ${n} linhas`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
