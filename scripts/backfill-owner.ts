import postgres from "postgres";

// Atribui dono às execuções que ainda não têm.
//
//   pnpm db:backfill-owner <linkedinId>
//   pnpm db:backfill-owner --check
//
// Ordem obrigatória: db:apply drizzle/0003_owner.sql → login → GET /api/auth/me
// (pega o linkedinId) → este script → db:apply drizzle/0004_owner_notnull.sql.
//
// Só toca em `owner_id IS NULL`: rodar duas vezes não rouba execução de ninguém,
// e rodar com o id errado depois de um backfill certo não desfaz o primeiro.
//
// Usa `postgres` direto, e não os stores, porque os stores já exigem ownerId —
// que é exatamente o que ainda não existe no banco neste momento.

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("uso: db:backfill-owner <linkedinId>  |  --check");
    console.error("o linkedinId sai de GET /api/auth/me com você logado.");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM runs
  `;
  const [{ orfas }] = await sql<{ orfas: number }[]>`
    SELECT count(*)::int AS orfas FROM runs WHERE owner_id IS NULL
  `;

  if (arg === "--check") {
    const donos = await sql<{ owner_id: string | null; n: number }[]>`
      SELECT owner_id, count(*)::int AS n FROM runs GROUP BY owner_id ORDER BY n DESC
    `;
    console.log(`${total} execuções, ${orfas} sem dono`);
    for (const d of donos) console.log(`  ${d.owner_id ?? "(sem dono)"}: ${d.n}`);
    await sql.end();
    process.exit(orfas > 0 ? 1 : 0);
  }

  if (orfas === 0) {
    console.log(`nada a fazer: as ${total} execuções já têm dono.`);
    await sql.end();
    process.exit(0);
  }

  const atualizadas = await sql`
    UPDATE runs SET owner_id = ${arg} WHERE owner_id IS NULL RETURNING thread_id
  `;
  console.log(`${atualizadas.length} de ${total} execuções agora pertencem a ${arg}.`);
  console.log("próximo passo: pnpm db:apply drizzle/0004_owner_notnull.sql");
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
