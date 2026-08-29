import { NextRequest, NextResponse } from "next/server";
import { getStudySelection } from "@/app/MAS/lib/studySample";
import { scoreDraft } from "@/app/MAS/nodes/judge.node";
import { requireArea } from "@/lib/dal";
import { sheetResponse } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cada draft × n rodadas é uma chamada de LLM; com 6 posts × 5 rodadas são 30.
export const maxDuration = 300;

// Confiabilidade intra-juiz (test-retest) do LLM-as-judge.
//
//   GET /api/mas/export/judge-repeat?n=5[&format=csv|xlsx]
//
// Re-pontua os MESMOS drafts da amostra n vezes e devolve uma linha por rodada.
// O estudo precisa disso porque a nota reportada por post vem de UMA única
// chamada a temperatura 0.1 — sem repetição não há como afirmar que a nota do
// juiz é estável, e "o juiz concorda com humanos" fica sem piso de comparação.
// O script de análise lê este CSV como `judge-repeat.csv` e calcula SD e ICC(2,1).
//
// ATENÇÃO: gasta crédito de LLM. Não é chamado por nenhuma tela — é manual.

const MAX_RUNS = 10;

const COLUMNS = [
  { header: "post", key: "post" },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "condition", key: "condition", width: 12 },
  { header: "run", key: "run" },
  { header: "score", key: "score" },
  { header: "hookQuality", key: "hookQuality" },
  { header: "originality", key: "originality" },
  { header: "scannability", key: "scannability" },
  { header: "ctaQuality", key: "ctaQuality" },
  { header: "lengthAdequate", key: "lengthAdequate" },
  { header: "toneLinkedIn", key: "toneLinkedIn" },
  { header: "hasEngagementBait", key: "hasEngagementBait" },
  { header: "hasExternalLinkInBody", key: "hasExternalLinkInBody" },
  { header: "judgeModel", key: "judgeModel", width: 16 },
  { header: "judgeTemperature", key: "judgeTemperature" },
  { header: "rubricHash", key: "rubricHash", width: 18 },
  { header: "judgedAt", key: "judgedAt", width: 22 },
];

export async function GET(req: NextRequest) {
  // Área `estudo` na matriz. Dobrado de importante aqui: além do dado do
  // estudo, cada rodada é uma chamada de LLM paga (6 posts × 5 = 30 chamadas).
  const auth = await requireArea("estudo");
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;
  const format = params.get("format");
  const requested = Number(params.get("n") ?? 5);
  const runs = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 2), MAX_RUNS)
    : 5;

  const { samples } = await getStudySelection(auth.ownerId);
  if (!samples.length) {
    return NextResponse.json(
      { error: "Amostra vazia — nenhum tópico pareado com/sem judge." },
      { status: 409 },
    );
  }

  const rows: Record<string, unknown>[] = [];
  const failures: { post: string; run: number }[] = [];

  // Sequencial de propósito: são chamadas caras e o rate limit da OpenAI
  // derruba o lote inteiro se dispararmos 30 de uma vez.
  for (const sample of samples) {
    for (let run = 1; run <= runs; run++) {
      const { judgement, meta } = await scoreDraft({
        topic: sample.topic,
        draft: sample.draft,
        postSize: sample.postSize,
      });
      if (!judgement) {
        failures.push({ post: sample.post, run });
        continue;
      }
      rows.push({
        post: sample.post,
        threadId: sample.threadId,
        condition: sample.condition,
        run,
        score: judgement.score,
        hookQuality: judgement.hookQuality,
        originality: judgement.originality,
        scannability: judgement.scannability,
        ctaQuality: judgement.ctaQuality,
        lengthAdequate: judgement.lengthAdequate,
        toneLinkedIn: judgement.toneLinkedIn,
        hasEngagementBait: judgement.hasEngagementBait,
        hasExternalLinkInBody: judgement.hasExternalLinkInBody,
        judgeModel: meta.model,
        judgeTemperature: meta.temperature,
        rubricHash: meta.rubricHash,
        judgedAt: meta.judgedAt,
      });
    }
  }

  if (format === "csv" || format === "xlsx") {
    return sheetResponse(COLUMNS, rows, `judge-repeat.${format}`);
  }

  return NextResponse.json({ runs, rows, failures });
}
