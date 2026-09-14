import postgres from "postgres";
async function main() {
  const t0 = Date.now();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 5, connect_timeout: 20 });
  // 1a query = conexão + handshake TLS
  await sql`select 1`;
  console.log(`conexão + 1a query: ${Date.now() - t0}ms`);
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await sql`select "role", "active" from "users" where "linkedin_id" = ${"wi0WJ2zA6-"} limit 1`;
    console.log(`  DAL query #${i + 1}: ${Date.now() - t}ms`);
  }
  const t2 = Date.now();
  await Promise.all(Array.from({ length: 10 }, () => sql`select 1`));
  console.log(`10 queries em paralelo (max=5): ${Date.now() - t2}ms`);
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`host: ${host}`);
  await sql.end();
}
main().catch((e)=>{console.error("ERRO:", e.message);process.exit(1)});
