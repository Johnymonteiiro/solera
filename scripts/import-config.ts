import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Importa a config que estava em disco para o banco.
//
//   pnpm db:import-config          → importa e mostra o que gravou
//   pnpm db:import-config --check  → só mostra o que ESTÁ no banco hoje
//
// Uma vez só, depois de aplicar drizzle/0006_config.sql. Idempotente:
// ON CONFLICT DO NOTHING — reimportar NÃO sobrescreve o que já foi editado pela
// tela. O arquivo JSON vira histórico; a partir daqui a verdade é a tabela.
//
// Usa `postgres` direto, e não os stores, porque os stores já leem do banco —
// que é justamente o que ainda está vazio neste momento.

const SEGREDOS = [
  "OPENAI_API_KEY",
  "TAVILY_API_KEY",
  "BRAVE_API_KEY",
  "LINKEDIN_CLIENT_SECRET",
];

function lerJson(rel: string): Record<string, unknown> {
  const p = path.join(process.cwd(), rel);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    console.log(`  (${rel} não existe ou está ilegível — pulando)`);
    return {};
  }
}

/** settings.json aninhado → chaves planas estilo .env da tabela app_settings. */
function achatar(s: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const api = (s.apiKeys ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(api)) if (v?.trim()) out[k] = v.trim();

  const li = (s.linkedin ?? {}) as Record<string, string>;
  const mapaLi: Record<string, string> = {
    clientId: "LINKEDIN_CLIENT_ID",
    clientSecret: "LINKEDIN_CLIENT_SECRET",
    redirectUri: "LINKEDIN_REDIRECT_URI",
  };
  for (const [k, v] of Object.entries(li)) {
    if (mapaLi[k] && v?.trim()) out[mapaLi[k]] = v.trim();
  }

  const busca = ((s.tools ?? {}) as Record<string, unknown>).search as
    | Record<string, unknown>
    | undefined;
  if (busca?.provider) out.SEARCH_PROVIDER = String(busca.provider);
  if (busca?.maxResults) out.SEARCH_MAX_RESULTS = String(busca.maxResults);

  const estudo = (s.study ?? {}) as Record<string, string>;
  if (estudo.formUrl?.trim()) out.STUDY_FORM_URL = estudo.formUrl.trim();

  return out;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const check = process.argv[2] === "--check";

  if (check) {
    const s = await sql<{ key: string; is_secret: boolean }[]>`
      SELECT key, is_secret FROM app_settings ORDER BY key
    `;
    const a = await sql<{ agent_id: string; enabled: boolean }[]>`
      SELECT agent_id, enabled FROM agent_configs ORDER BY agent_id
    `;
    const p = await sql<{ role: string; n: number }[]>`
      SELECT role, count(*)::int AS n FROM role_permissions GROUP BY role ORDER BY role
    `;
    console.log(`app_settings: ${s.length} chave(s)`);
    for (const r of s) console.log(`  ${r.key}${r.is_secret ? "  (segredo)" : ""}`);
    console.log(`agent_configs: ${a.length} agente(s)`);
    for (const r of a) console.log(`  ${r.agent_id}  enabled=${r.enabled}`);
    console.log("role_permissions:");
    for (const r of p) console.log(`  ${r.role}: ${r.n} áreas`);
    await sql.end();
    process.exit(0);
  }

  console.log("lendo data/settings.json…");
  const settings = achatar(lerJson("data/settings.json"));
  let gravadas = 0;
  for (const [key, value] of Object.entries(settings)) {
    const r = await sql`
      INSERT INTO app_settings (key, value, is_secret, updated_at)
      VALUES (${key}, ${value}, ${SEGREDOS.includes(key)}, now())
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `;
    if (r.length) {
      gravadas++;
      console.log(`  + ${key}${SEGREDOS.includes(key) ? "  (segredo)" : ` = ${value}`}`);
    } else {
      console.log(`  = ${key} já existia no banco — mantido`);
    }
  }
  console.log(`${gravadas} de ${Object.keys(settings).length} chaves importadas.`);

  console.log("\nlendo data/agent-config.json…");
  const agentes = lerJson("data/agent-config.json");
  let ag = 0;
  for (const [id, cfg] of Object.entries(agentes)) {
    const c = (cfg ?? {}) as Record<string, unknown>;
    // A config antiga chamava o judge de "critic".
    const agentId = id === "critic" ? "judge" : id;
    const r = await sql`
      INSERT INTO agent_configs (agent_id, enabled, role, prompt_override, updated_at)
      VALUES (
        ${agentId},
        ${c.enabled !== false},
        ${String(c.role ?? "")},
        ${String(c.promptOverride ?? "")},
        now()
      )
      ON CONFLICT (agent_id) DO NOTHING
      RETURNING agent_id
    `;
    if (r.length) {
      ag++;
      const ov = String(c.promptOverride ?? "").length;
      console.log(`  + ${agentId}  enabled=${c.enabled !== false}  override=${ov}ch`);
    } else {
      console.log(`  = ${agentId} já existia no banco — mantido`);
    }
  }
  console.log(`${ag} agente(s) importado(s).`);

  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM role_permissions
  `;
  console.log(`\nrole_permissions: ${n} linhas (semeadas pela migration 0006).`);
  console.log(
    "\nA partir daqui a verdade é a tabela. Os JSON em data/ viram histórico —\n" +
      "podem ficar onde estão; nada mais os lê.",
  );

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
