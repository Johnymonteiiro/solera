import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { draftVersions, getDb, judgements, runs } from "@/db";
import { currentRubricHash, scoreDraft } from "../src/app/MAS/nodes/judge.node";
import { closeDb } from "./closeDb";

// Lado do Critic para os 10 posts que foram ao formulário humano.
//
//   pnpm study:critic-form                     → study/data/critic-scores.csv (sem LLM)
//   pnpm study:critic-form --repeat 5          → mostra o que seria feito (sem LLM)
//   pnpm study:critic-form --repeat 5 --go     → study/data/critic-repeat.csv (PAGO)
//
// ── critic-scores.csv ───────────────────────────────────────────────────────
// A nota que ENTRA na comparação com os humanos: a gravada em `judgements`, com
// a procedência e o que o run registrou (tentativas, revisões, status). Foi
// criado porque a aba do Critic na planilha de respostas foi digitada à mão e
// divergiu do banco no post D — o número do artigo precisa sair daqui.
//
// ── critic-repeat.csv ───────────────────────────────────────────────────────
// Teste-reteste: o MESMO texto pontuado N vezes com o juiz atual, e um controle
// de sensibilidade (o post truncado a 35%) pontuado uma vez. NÃO grava no banco:
// `scoreDraft` só pontua, e quem persiste é `recordJudgement`, que não é chamado.
//
// Aborta se o hash do instrumento não for o das notas gravadas: repetir com
// outro prompt mediria outro juiz (o `promptOverride` do banco já trocou o juiz
// sem aviso antes — ver project_agent_config_prompt_hazard).

// Letra do formulário → versão avaliada. A ordem é a das seções do Google Forms.
const FORM_POSTS: [string, string][] = [
  ["A", "629a7185-337b-44e7-bb81-85111e62a10b"],
  ["J", "faff6e09-abe3-4239-a2c6-ef7d85a21a71"],
  ["D", "aa283937-168b-4747-a318-adab8c8d12bb"],
  ["L", "5037f215-6494-4a97-9ab6-b5c5aa29a72a"],
  ["F", "f2c6af88-3d87-46f4-8efc-2ea894756021"],
  ["P", "2bbef9b1-daec-476c-933e-3efb5625e7c8"],
  ["I", "0b2248eb-622b-4e8f-82e2-2624e6fce506"],
  ["E", "e33f2e99-0499-4a66-a196-3f53ce44ea34"],
  ["H", "8c2fce5f-8d39-4002-9221-af4bdc7bfafe"],
  ["C", "62f5e3bd-2042-48c8-a342-f02184e29066"],
];

/** Fração do texto mantida no controle de sensibilidade. */
const TRUNCATE_KEEP = 0.35;

const DATA_DIR = path.join(process.cwd(), "study", "data");
const DIMS = ["clarity", "relevance", "professional", "engagement", "overall"] as const;

const args = process.argv.slice(2);
const go = args.includes("--go");
const repeatIdx = args.indexOf("--repeat");
const repeat = repeatIdx >= 0 ? Math.max(2, Number(args[repeatIdx + 1]) || 5) : 0;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[]) {
  const header = Object.keys(rows[0]);
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
  fs.writeFileSync(path.join(DATA_DIR, file), lines.join("\n") + "\n", "utf8");
  console.log(`→ study/data/${file} (${rows.length} linhas)`);
}

/** Corta em limite de palavra, para o controle não terminar no meio de uma. */
function truncate(text: string, keep: number): string {
  const cut = text.slice(0, Math.round(text.length * keep));
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

async function loadPosts() {
  const db = getDb();
  const ids = FORM_POSTS.map(([, id]) => id);
  const rows = await db
    .select({ version: draftVersions, judgement: judgements, run: runs })
    .from(draftVersions)
    .innerJoin(judgements, eq(judgements.draftVersionId, draftVersions.id))
    .innerJoin(runs, eq(runs.threadId, draftVersions.threadId))
    .where(inArray(draftVersions.id, ids));
  const byId = new Map(rows.map((r) => [r.version.id, r]));
  return FORM_POSTS.map(([post, id], order) => {
    const r = byId.get(id);
    if (!r) throw new Error(`versão ${id} (post ${post}) não encontrada no banco`);
    return { post, order: order + 1, ...r };
  });
}

async function main() {
  const posts = await loadPosts();

  writeCsv(
    "critic-scores.csv",
    posts.map(({ post, order, version, judgement, run }) => ({
      post,
      formOrder: order,
      versionId: version.id,
      threadId: version.threadId,
      version: version.version,
      trigger: version.trigger,
      topic: run.topic,
      postSize: run.postSize,
      writerModel: run.writerModel,
      judgeLoop: run.judgeLoop,
      judgeRetries: run.judgeRetries,
      revisionCount: run.revisionCount,
      status: run.status,
      charCount: version.charCount,
      clarity: judgement.clarity,
      relevance: judgement.relevance,
      professional: judgement.professional,
      engagement: judgement.engagement,
      overall: judgement.overall,
      decision: judgement.decision,
      coherenceClamped: judgement.coherenceClamped,
      judgeModel: judgement.model,
      judgeTemperature: judgement.temperature,
      rubricVersion: judgement.rubricVersion,
      rubricHash: judgement.rubricHash,
      judgedAt: judgement.judgedAt.toISOString(),
      createdAt: version.createdAt.toISOString(),
    })),
  );

  if (!repeat) return;

  const hashes = new Set(posts.map((p) => p.judgement.rubricHash));
  const hashAtual = await currentRubricHash();
  console.log(`\nhash das notas gravadas: ${[...hashes].join(", ")} · hash atual: ${hashAtual}`);
  if (hashes.size !== 1 || !hashes.has(hashAtual)) {
    console.error("ABORTADO: o instrumento atual não é o das notas gravadas.");
    process.exitCode = 1;
    return;
  }

  const calls = posts.length * (repeat + 1);
  if (!go) {
    console.log(`\n${posts.length} posts × ${repeat} rodadas + 1 controle truncado = ${calls} chamadas (nada foi gasto).`);
    console.log(`Para executar:  pnpm study:critic-form --repeat ${repeat} --go\n`);
    return;
  }

  const out: Record<string, unknown>[] = [];
  const falhas: string[] = [];
  let n = 0;
  // Sequencial: chamadas pagas, e o rate limit derruba o lote se vierem juntas.
  for (const p of posts) {
    const jobs = [
      ...Array.from({ length: repeat }, (_, i) => ({ condition: "original", run: i + 1, draft: p.version.content })),
      { condition: `truncated${Math.round(TRUNCATE_KEEP * 100)}`, run: 1, draft: truncate(p.version.content, TRUNCATE_KEEP) },
    ];
    for (const job of jobs) {
      n++;
      process.stdout.write(`[${n}/${calls}] ${p.post} ${job.condition} #${job.run} `);
      // postSize "medium" como no corpus:rejudge — é a faixa das notas gravadas.
      const { judgement, meta } = await scoreDraft({ topic: p.run.topic, draft: job.draft, postSize: "medium" });
      if (!judgement) {
        console.log("FALHOU (parse)");
        falhas.push(`${p.post}/${job.condition}/${job.run}`);
        continue;
      }
      console.log(DIMS.map((d) => judgement[d]).join(","), judgement.decision);
      out.push({
        post: p.post,
        versionId: p.version.id,
        condition: job.condition,
        run: job.run,
        charCount: job.draft.length,
        clarity: judgement.clarity,
        relevance: judgement.relevance,
        professional: judgement.professional,
        engagement: judgement.engagement,
        overall: judgement.overall,
        decision: judgement.decision,
        coherenceClamped: judgement.coherenceClamped,
        judgeModel: meta.model,
        judgeTemperature: meta.temperature,
        rubricHash: meta.rubricHash,
        judgedAt: meta.judgedAt,
      });
    }
  }
  if (out.length) writeCsv("critic-repeat.csv", out);
  if (falhas.length) console.log(`falharam: ${falhas.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
