import fs from "node:fs";
import path from "node:path";
import { ORIGINAL_ARM, getCorpusSelection, type CorpusItem } from "../src/app/MAS/lib/studyCorpus";
import { listRunInputs } from "../src/app/MAS/lib/studyRecorder";
import { currentRubricHash, scoreDraft } from "../src/app/MAS/nodes/judge.node";
import type { PostSize } from "../src/app/MAS/types/types";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Notas do Critic para o benchmark de escritores do artigo — TODOS os braços
// sob o MESMO juiz.
//
//   pnpm study:benchmark        → PLANO (sem LLM)
//   pnpm study:benchmark --go   → study/data/benchmark-scores.csv (PAGO: 10 chamadas)
//
// ── Por que existe ──────────────────────────────────────────────────────────
// Os braços Claude e Gemini (gerados em 2026-09-18) foram pontuados pelo Judge
// atual. O braço GPT é o corpus original, pontuado em 2026-09-08 por outra
// versão do prompt do Judge (em português, com papel do banco). Comparar os três
// com essas notas mediria a diferença entre os juízes. Aqui a v1 de cada post do
// GPT é pontuada DE NOVO pelo Judge atual.
//
// NÃO grava no banco: `scoreDraft` só pontua (quem persiste é `recordJudgement`,
// que não é chamado). A nota original do GPT é a que o artigo compara com os
// humanos e continua intocada — e também vai no CSV, com judge="stored_old",
// para o artigo poder mostrar o efeito da troca do prompt do Judge no MESMO texto.
//
// Aborta se Claude/Gemini não tiverem sido pontuados pelo juiz atual: aí as
// notas deles também seriam de outro juiz.

const ARMS: { arm: string; model: string }[] = [
  { arm: "gpt", model: ORIGINAL_ARM },
  { arm: "claude", model: "anthropic/claude-sonnet-5" },
  { arm: "gemini", model: "google/gemini-3.8-flash" },
];
const DIMS = ["clarity", "relevance", "professional", "engagement", "overall"] as const;
const OUT = path.join(process.cwd(), "study", "data", "benchmark-scores.csv");
const go = process.argv.includes("--go");

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const owner = ownerFromEnv();
  const hashAtual = await currentRubricHash();
  const tamanho = new Map((await listRunInputs(owner)).map((r) => [r.threadId, r.postSize as PostSize]));

  const porBraco = new Map<string, CorpusItem[]>();
  for (const a of ARMS) {
    const { items } = await getCorpusSelection(owner, a.model);
    porBraco.set(a.arm, items.filter((i) => i.inCorpus && i.label && i.judgement).sort((x, y) => x.label!.localeCompare(y.label!)));
  }

  // O juiz é MODELO + prompt. O `rubricHash` cobre só o prompt: em 2026-09-18 a
  // config do Critic foi trocada para o Claude na tela, o hash continuou igual e
  // uma re-pontuação saiu com o modelo errado. O modelo agora vem das notas
  // gravadas dos braços novos e é passado explicitamente ao scoreDraft.
  const novos = ARMS.filter((x) => x.arm !== "gpt").flatMap((a) => porBraco.get(a.arm)!);
  const modelos = [...new Set(novos.map((i) => i.judgeMeta?.model ?? "?"))];
  const hashes = [...new Set(novos.map((i) => i.judgeMeta?.rubricHash ?? "?"))];
  const porBracoOk = ARMS.filter((x) => x.arm !== "gpt").every((a) => porBraco.get(a.arm)!.length === 10);
  if (!porBracoOk || modelos.length !== 1 || hashes.length !== 1 || hashes[0] !== hashAtual) {
    console.error(
      `✗ os braços novos precisam de 10 posts cada e de UM juiz, igual ao prompt atual.\n` +
        `  modelos: ${modelos.join(", ")} · hashes: ${hashes.join(", ")} · hash atual: ${hashAtual}`,
    );
    process.exitCode = 1;
    await closeDb();
    return;
  }
  const judgeModel = modelos[0];
  const gpt = porBraco.get("gpt")!;
  console.log(`juiz dos braços novos: ${judgeModel} · prompt ${hashAtual} · GPT: ${gpt.length} posts a re-pontuar com esse juiz`);

  if (!go) {
    console.log("\nPLANO: 10 chamadas ao Judge (GPT-4.1) nos posts do GPT, sem gravar no banco.");
    console.log("Para executar:  pnpm study:benchmark --go\n");
    await closeDb();
    return;
  }

  const linha = (arm: string, judge: string, i: CorpusItem, j: NonNullable<CorpusItem["judgement"]>, meta: { model: string; rubricHash: string; judgedAt: string }) => ({
    arm,
    judge,
    post: i.label,
    versionId: i.versionId,
    threadId: i.threadId,
    writerModel: i.writerModel,
    topic: i.topic,
    postSize: tamanho.get(i.threadId) ?? "",
    charCount: i.charCount,
    ...Object.fromEntries(DIMS.map((d) => [d, j[d]])),
    decision: j.decision,
    judgeModel: meta.model,
    rubricHash: meta.rubricHash,
    judgedAt: meta.judgedAt,
  });

  const rows: Record<string, unknown>[] = [];
  for (const i of gpt) rows.push(linha("gpt", "stored_old", i, i.judgement!, i.judgeMeta!));

  for (const [n, i] of gpt.entries()) {
    process.stdout.write(`[${n + 1}/${gpt.length}] GPT ${i.label} … `);
    const { judgement, meta } = await scoreDraft({
      topic: i.topic,
      draft: i.content,
      postSize: tamanho.get(i.threadId) ?? "medium",
      judgeModel,
    });
    if (!judgement) throw new Error(`Judge não devolveu nota para o post ${i.label}`);
    if (meta.model !== judgeModel) throw new Error(`juiz ${meta.model} ≠ ${judgeModel}`);
    console.log(`${judgement.decision} c${judgement.clarity} r${judgement.relevance} p${judgement.professional} e${judgement.engagement} g${judgement.overall}`);
    rows.push(linha("gpt", "current", i, judgement, meta));
  }
  for (const a of ARMS.filter((x) => x.arm !== "gpt")) {
    for (const i of porBraco.get(a.arm)!) rows.push(linha(a.arm, "current", i, i.judgement!, i.judgeMeta!));
  }

  const header = Object.keys(rows[0]);
  fs.writeFileSync(OUT, [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n", "utf8");
  console.log(`\n→ study/data/benchmark-scores.csv (${rows.length} linhas)`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
