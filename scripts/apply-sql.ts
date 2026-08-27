/**
 * Aplica um arquivo .sql gerado pelo drizzle-kit.
 * Existe porque `drizzle-kit migrate`/`push` engasgam contra o Supabase
 * (o push quebra ao introspectar CHECK constraints das extensões).
 *   pnpm db:apply drizzle/0001_x.sql
 */
import fs from "node:fs";
import postgres from "postgres";

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("uso: db:apply <arquivo.sql>"); process.exit(1); }
  const sqlText = fs.readFileSync(file, "utf8");
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  let ok = 0, skipped = 0;
  for (const st of statements) {
    try {
      await sql.unsafe(st);
      ok++;
    } catch (e) {
      const msg = (e as Error).message;
      // Idempotência: re-aplicar um SQL já aplicado não é erro.
      if (/already exists/i.test(msg)) { skipped++; continue; }
      console.error("FALHOU:", st.slice(0, 90), "\n ->", msg);
      await sql.end();
      process.exit(1);
    }
  }
  console.log(`${ok} statements aplicados, ${skipped} já existiam.`);
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
