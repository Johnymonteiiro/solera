import {
  MAX_SAMPLE_PAIRS,
  selectRevisionPairs,
} from "../src/app/MAS/lib/revisionPairs";
import type { RunMetaRecord, VersionRecord } from "../src/app/MAS/lib/studyRecorder";

// Testa a REGRA de amostragem do form com dados sintéticos.
//   pnpm test:sample-rule
//
// Existe porque o banco real hoje tem 2 execuções com par, ambas do mesmo tipo:
// não exercita dedupe por tópico, teto, prioridade de `exhausted` nem a
// estabilidade FIFO — que são justamente as decisões do desenho. `selectRevisionPairs`
// é função pura (recebe runs + históricos), então dá pra provocar cada ramo.

let falhas = 0;

function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

function run(
  threadId: string,
  topic: string,
  createdAt: string,
  judgeRetries: number,
  excludedAt: string | null = null,
): RunMetaRecord {
  return {
    excludedAt,
    excludedReason: excludedAt ? "descartada no teste" : null,
    threadId,
    topic,
    topicNorm: topic.toLowerCase(),
    status: "awaiting_review",
    judgeLoop: true,
    revisionCount: 0,
    judgeRetries,
    createdAt,
    completedAt: null,
  };
}

/** n versões, todas com nota (score sobe 1 por versão) e trigger judge_retry. */
function history(threadId: string, n: number): VersionRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${threadId}-v${i + 1}`,
    threadId,
    version: i + 1,
    content: `draft ${threadId} v${i + 1}`,
    charCount: 700 + i,
    trigger: i === 0 ? ("initial" as const) : ("judge_retry" as const),
    createdAt: `2026-08-0${i + 1}T00:00:00.000Z`,
    judgement: {
      score: 4 + i,
      hookQuality: 5,
      originality: 5,
      scannability: 5,
      ctaQuality: 5,
      lengthAdequate: true,
      toneLinkedIn: true,
      hasEngagementBait: false,
      hasExternalLinkInBody: false,
      issues: [],
      suggestions: [],
    },
    judgeMeta: {
      model: "gpt-4o",
      temperature: 0.1,
      rubricHash: "abc123",
      judgedAt: "2026-08-01T00:00:00.000Z",
    },
  }));
}

function select(runs: RunMetaRecord[], versoes: Record<string, number>) {
  const histories = new Map(
    runs.map((r) => [r.threadId, history(r.threadId, versoes[r.threadId] ?? 1)]),
  );
  return selectRevisionPairs(runs, histories);
}

// ── 1. O par do estudo é o LOOP INTEIRO: v1 → última versão do judge ─────
console.log("\n1. par do estudo = v1 → última do loop");
{
  const runs = [run("t1", "tema um", "2026-08-01T00:00:00.000Z", 3)];
  const { pairs } = select(runs, { t1: 4 });
  const amostra = pairs.filter((p) => p.inSample);
  check(
    "4 pares no dataset (1 loop + 3 consecutivos)",
    pairs.length === 4,
    `${pairs.length}`,
  );
  check("1 par na amostra", amostra.length === 1, `${amostra.length}`);
  check("o par da amostra é kind=loop", amostra[0]?.kind === "loop", amostra[0]?.kind);
  check(
    "é o v1→v4 (v1 × última do loop)",
    amostra[0]?.before.version === 1 && amostra[0]?.after.version === 4,
    `v${amostra[0]?.before.version}→v${amostra[0]?.after.version}`,
  );
  check(
    "os consecutivos ficam como par_intermediario",
    pairs.filter((p) => p.sampleExclusion === "par_intermediario").length === 3,
  );
  check(
    "só as 2 versões da amostra têm rótulo",
    new Set(
      pairs
        .flatMap((p) => [p.before, p.after])
        .filter((v) => v.label)
        .map((v) => v.id),
    ).size === 2,
  );
}

// ── 2. Um par por tópico: a execução MAIS ANTIGA vence ─────────────────────
console.log("\n2. dedupe por tópico (mais antiga vence)");
{
  const runs = [
    run("novo", "mesmo tema", "2026-08-20T00:00:00.000Z", 1),
    run("antigo", "mesmo tema", "2026-08-02T00:00:00.000Z", 1),
  ];
  const { pairs, stats } = select(runs, { novo: 2, antigo: 2 });
  const amostra = pairs.filter((p) => p.inSample);
  check("1 par na amostra", amostra.length === 1, `${amostra.length}`);
  check("venceu a mais antiga", amostra[0]?.threadId === "antigo", amostra[0]?.threadId);
  check(
    "a outra fica como topico_repetido",
    pairs.some((p) => p.sampleExclusion === "topico_repetido"),
  );
  check("stats.paresForaDaAmostra = 1", stats.paresForaDaAmostra === 1);
}

// ── 3. Teto + prioridade de exhausted ──────────────────────────────────────
console.log(`\n3. teto de ${MAX_SAMPLE_PAIRS} pares, exhausted primeiro`);
{
  // 6 tópicos distintos; os dois últimos estouraram MAX_JUDGE_RETRIES e são os
  // MAIS RECENTES — têm que furar a fila mesmo assim.
  const runs = [
    run("a", "tema a", "2026-08-01T00:00:00.000Z", 1),
    run("b", "tema b", "2026-08-02T00:00:00.000Z", 1),
    run("c", "tema c", "2026-08-03T00:00:00.000Z", 1),
    run("d", "tema d", "2026-08-04T00:00:00.000Z", 1),
    run("e", "tema e", "2026-08-05T00:00:00.000Z", 3),
    run("f", "tema f", "2026-08-06T00:00:00.000Z", 3),
  ];
  const versoes = { a: 2, b: 2, c: 2, d: 2, e: 4, f: 4 };
  const { pairs, stats } = select(runs, versoes);
  const amostra = pairs.filter((p) => p.inSample).map((p) => p.threadId);
  check(
    `amostra tem ${MAX_SAMPLE_PAIRS} pares`,
    amostra.length === MAX_SAMPLE_PAIRS,
    `${amostra.length}`,
  );
  check(
    "as 2 exhausted entraram",
    amostra.includes("e") && amostra.includes("f"),
    amostra.join(","),
  );
  check(
    "completou com as mais antigas (a, b)",
    amostra.includes("a") && amostra.includes("b"),
    amostra.join(","),
  );
  check(
    "sobrou fora do teto",
    pairs.some((p) => p.sampleExclusion === "acima_do_teto"),
  );
  check(`${stats.formMaxPosts} posts no form`, stats.versoesRotuladas === stats.formMaxPosts);
}

// ── 4. Estabilidade: execução nova não remapeia as letras já atribuídas ────
console.log("\n4. estabilidade FIFO (form já a campo não quebra)");
{
  const base = [
    run("a", "tema a", "2026-08-01T00:00:00.000Z", 1),
    run("b", "tema b", "2026-08-02T00:00:00.000Z", 1),
  ];
  const antes = select(base, { a: 2, b: 2 });
  const depois = select(
    [...base, run("z", "tema z", "2026-08-30T00:00:00.000Z", 1)],
    { a: 2, b: 2, z: 2 },
  );
  const mapa = (sel: ReturnType<typeof select>) =>
    Object.fromEntries(
      sel.pairs
        .filter((p) => p.inSample)
        .flatMap((p) => [p.before, p.after])
        .map((v) => [v.id, v.label]),
    );
  const m1 = mapa(antes);
  const m2 = mapa(depois);
  const mantidos = Object.entries(m1).filter(([id, l]) => m2[id] === l).length;
  check(
    "rótulos anteriores preservados",
    mantidos === Object.keys(m1).length,
    `${mantidos}/${Object.keys(m1).length}`,
  );
  check("a nova entrou", Object.keys(m2).length === Object.keys(m1).length + 2);
}

// ── 5. Execução aprovada de primeira não gera par e entra na taxa ──────────
console.log("\n5. aprovado de primeira");
{
  const runs = [
    run("ok", "tema ok", "2026-08-01T00:00:00.000Z", 0),
    run("rev", "tema rev", "2026-08-02T00:00:00.000Z", 1),
  ];
  const histories = new Map([
    // score 8 na v1, sem reescrita: passou do gate
    ["ok", history("ok", 1).map((v) => ({ ...v, judgement: { ...v.judgement!, score: 8 } }))],
    ["rev", history("rev", 2)],
  ]);
  const { stats } = selectRevisionPairs(runs, histories);
  check("firstPass = 1", stats.firstPass === 1, `${stats.firstPass}`);
  check("revised = 1", stats.revised === 1, `${stats.revised}`);
  check("taxa = 50%", stats.firstPassRate === 0.5, `${stats.firstPassRate}`);
}

// ── 6. O resíduo conhecido: exhausted nova com o teto CHEIO desloca alguém ─
console.log("\n6. resíduo assumido: exhausted nova com teto cheio remapeia");
{
  const cheio = [
    run("a", "tema a", "2026-08-01T00:00:00.000Z", 1),
    run("b", "tema b", "2026-08-02T00:00:00.000Z", 1),
    run("c", "tema c", "2026-08-03T00:00:00.000Z", 1),
    run("d", "tema d", "2026-08-04T00:00:00.000Z", 1),
  ];
  const versoes = { a: 2, b: 2, c: 2, d: 2, x: 4 };
  const depois = select(
    [...cheio, run("x", "tema x", "2026-08-09T00:00:00.000Z", 3)],
    versoes,
  );
  const amostra = depois.pairs.filter((p) => p.inSample).map((p) => p.threadId);
  check("a exhausted nova entra na frente", amostra.includes("x"), amostra.join(","));
  check("e desloca a última da fila (d sai)", !amostra.includes("d"), amostra.join(","));
  console.log(
    "  i com o teto cheio, uma execução exhausted nova ocupa o lugar de outra —",
  );
  console.log(
    "    é o único caso em que letras já distribuídas mudam de dono. Reexporte o",
  );
  console.log("    mapping antes de cruzar respostas se o form já foi a campo.");
}

// ── 7. Descarte: sai da análise, continua no registro ─────────────────────
console.log("\n7. execução descartada do estudo");
{
  const runs = [
    run("keep", "tema keep", "2026-08-01T00:00:00.000Z", 1),
    run("drop", "tema drop", "2026-08-02T00:00:00.000Z", 1, "2026-08-26T20:00:00.000Z"),
  ];
  const { pairs, runs: overviews, stats } = select(runs, { keep: 2, drop: 4 });
  const descartada = overviews.find((r) => r.threadId === "drop")!;
  check("outcome = descartado", descartada.outcome === "descartado", descartada.outcome);
  check("stats.runsDescartados = 1", stats.runsDescartados === 1);
  check(
    "os pares dela continuam no registro",
    pairs.filter((p) => p.threadId === "drop").length === 4,
    `${pairs.filter((p) => p.threadId === "drop").length}`,
  );
  check(
    "mas nenhum é elegível",
    pairs.filter((p) => p.threadId === "drop").every((p) => !p.eligible && p.excludeReason === "run_descartado"),
  );
  check("nenhum entra no form", !pairs.some((p) => p.threadId === "drop" && p.inSample));
  check(
    "não conta na taxa de aprovação de primeira",
    stats.runsAvaliados === 1,
    `${stats.runsAvaliados}`,
  );
  check("a outra segue na amostra", pairs.some((p) => p.threadId === "keep" && p.inSample));
}

// ── 8. Revisão humana TRUNCA o par do loop ──────────────────────────
console.log("\n8. revisão humana não entra no par do loop");
{
  // initial, judge_retry, judge_retry, human_revision, human_revision — foi a
  // forma do thread_1d8e23eb real. O par do estudo tem que parar na v3.
  const runs = [run("mix", "tema mix", "2026-08-01T00:00:00.000Z", 4)];
  const versoes = history("mix", 5).map((v, i) => ({
    ...v,
    trigger: (i === 0 ? "initial" : i <= 2 ? "judge_retry" : "human_revision") as typeof v.trigger,
  }));
  const { pairs } = selectRevisionPairs(runs, new Map([["mix", versoes]]));
  const amostra = pairs.filter((p) => p.inSample);
  check(
    "par do loop é v1→v3, não v1→v5",
    amostra[0]?.before.version === 1 && amostra[0]?.after.version === 3,
    `v${amostra[0]?.before.version}→v${amostra[0]?.after.version}`,
  );
  check(
    "os pares humanos ficam fora (outro tratamento)",
    pairs
      .filter((p) => p.cause === "human_revision")
      .every((p) => !p.eligible && p.excludeReason === "revisao_humana"),
  );
  check(
    "nenhuma versão humana recebe rótulo",
    !pairs
      .flatMap((p) => [p.before, p.after])
      .some((v) => v.trigger === "human_revision" && v.label),
  );
}

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
