import { listModels } from "./modelStore";
import { RUBRIC_DIMENSIONS, composite, type RubricDimension } from "./rubric";
import { ORIGINAL_ARM, selectCorpus } from "./studyCorpus";
import { getAllVersionHistories, listRunMeta } from "./studyRecorder";

// ─── Benchmark do estudo: um braço por modelo do Writer ──────────────────────
//
// Agrega, por modelo, as notas do Judge na v1 dos posts de cada braço — a
// MESMA seleção da tela de dados (studyCorpus.ts), então um post que aparece lá
// é exatamente o que entra aqui. Os tópicos se cruzam pela letra: cada braço
// herda a letra do post original do mesmo tópico.
//
// O que isto NÃO decide: se as notas são comparáveis. Isso depende de os
// braços terem sido avaliados pelo MESMO juiz (modelo + rubricHash). Os dois
// vão junto por braço, e a tela avisa quando divergem — ranking entre juízes
// diferentes mede a diferença entre os juízes, não entre os escritores.

export type ScoreKey = RubricDimension | "overall" | "composite";

export interface BenchmarkArm {
  /** `runs.writer_model`; "" = corpus original. */
  model: string;
  label: string;
  /** Posts do braço que entram na comparação (v1 avaliada, tópico do corpus). */
  n: number;
  accept: number;
  reject: number;
  /** Médias das notas do Judge. null com n = 0. */
  means: Record<ScoreKey, number> | null;
  meanChars: number | null;
  /** Juiz(es) que deram as notas deste braço — para checar comparabilidade. */
  judgeModels: string[];
  rubricHashes: string[];
}

export interface BenchmarkTopic {
  label: string;
  topic: string;
  /** Por modelo: nota composta, geral e decisão do post daquele braço. */
  byModel: Record<string, { composite: number; overall: number; decision: string }>;
}

export interface BenchmarkData {
  arms: BenchmarkArm[];
  topics: BenchmarkTopic[];
  /** true quando algum par de braços com posts foi avaliado por juízes diferentes. */
  mixedJudges: boolean;
}

const ORIGINAL_LABEL = "GPT · corpus original";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function getBenchmark(ownerId: string): Promise<BenchmarkData> {
  const [runs, histories, catalogo] = await Promise.all([
    listRunMeta(ownerId),
    getAllVersionHistories(ownerId),
    listModels(),
  ]);
  const labelOf = new Map(catalogo.map((m) => [m.id, m.label]));

  // Braços = o original + tudo que tem execução + o catálogo (mesmo sem posts,
  // para a tela mostrar o que falta gerar).
  const modelos = new Set<string>([ORIGINAL_ARM, ...runs.map((r) => r.writerModel), ...catalogo.map((m) => m.id)]);

  const arms: BenchmarkArm[] = [];
  const topics = new Map<string, BenchmarkTopic>();

  for (const model of modelos) {
    const { items } = selectCorpus(runs, histories, model);
    const dentro = items.filter((i) => i.inCorpus && i.judgement && i.label);

    const scores = dentro.map((i) => {
      const j = i.judgement!;
      const dims = Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d.key, j[d.key]])) as Record<RubricDimension, number>;
      return { ...dims, overall: j.overall, composite: composite(dims) };
    });
    const keys: ScoreKey[] = [...RUBRIC_DIMENSIONS.map((d) => d.key), "overall", "composite"];
    const accept = dentro.filter((i) => i.judgement!.decision === "ACCEPT").length;

    arms.push({
      model,
      label: model === ORIGINAL_ARM ? ORIGINAL_LABEL : (labelOf.get(model) ?? model),
      n: dentro.length,
      accept,
      reject: dentro.length - accept,
      means: dentro.length
        ? (Object.fromEntries(keys.map((k) => [k, mean(scores.map((s) => s[k]))!])) as Record<ScoreKey, number>)
        : null,
      meanChars: mean(dentro.map((i) => i.charCount)),
      judgeModels: [...new Set(dentro.map((i) => i.judgeMeta?.model).filter((x): x is string => !!x))],
      rubricHashes: [...new Set(dentro.map((i) => i.judgeMeta?.rubricHash).filter((x): x is string => !!x))],
    });

    dentro.forEach((i, idx) => {
      const t = topics.get(i.label!) ?? { label: i.label!, topic: i.topic, byModel: {} };
      t.byModel[model] = {
        composite: scores[idx].composite,
        overall: i.judgement!.overall,
        decision: i.judgement!.decision,
      };
      topics.set(i.label!, t);
    });
  }

  // Comparabilidade: todo braço com posts tem que ter UM juiz, e o mesmo.
  const comNotas = arms.filter((a) => a.n > 0);
  const assinatura = (a: BenchmarkArm) => `${a.judgeModels.join("|")}#${a.rubricHashes.join("|")}`;
  const mixedJudges =
    comNotas.some((a) => a.judgeModels.length > 1 || a.rubricHashes.length > 1) ||
    new Set(comNotas.map(assinatura)).size > 1;

  return {
    arms,
    topics: [...topics.values()].sort((a, b) => a.label.localeCompare(b.label)),
    mixedJudges,
  };
}
