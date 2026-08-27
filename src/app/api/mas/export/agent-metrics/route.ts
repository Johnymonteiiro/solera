import { NextRequest, NextResponse } from "next/server";
import { getStudySelection, StudySample } from "@/app/MAS/lib/studySample";
import { sheetResponse } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Export das métricas do agente para o estudo Agent-as-judge.
//   GET /api/mas/export/agent-metrics                 → JSON { samples, excluded, topics }
//   GET /api/mas/export/agent-metrics?format=csv      → CSV (entrada da análise)
//   GET /api/mas/export/agent-metrics?format=xlsx     → Excel (conferência manual)
//   GET /api/mas/export/agent-metrics?format=posts    → texto dos drafts (p/ Google Form)
//   GET /api/mas/export/agent-metrics?format=mapping  → mapping.csv (post ↔ condição/tópico)
//
// A amostra e os rótulos cegos (Post A, B…) vêm de `selectStudySample`, então
// os quatro formatos concordam por construção. O `mapping.csv` é gerado aqui
// justamente para o pesquisador não montá-lo à mão — era a maior fonte de erro
// no cruzamento com o Google Forms.

const COLUMNS: { header: string; key: string; width?: number }[] = [
  { header: "post", key: "post" },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "topic", key: "topic", width: 32 },
  { header: "topicKey", key: "topicKey", width: 32 },
  { header: "condition", key: "condition", width: 12 },
  { header: "createdAt", key: "createdAt", width: 22 },
  { header: "status", key: "status", width: 14 },
  { header: "revisionCount", key: "revisionCount" },
  { header: "judgeRetries", key: "judgeRetries" },
  { header: "score", key: "score" },
  { header: "hookQuality", key: "hookQuality" },
  { header: "originality", key: "originality" },
  { header: "scannability", key: "scannability" },
  { header: "ctaQuality", key: "ctaQuality" },
  { header: "lengthAdequate", key: "lengthAdequate" },
  { header: "toneLinkedIn", key: "toneLinkedIn" },
  { header: "hasEngagementBait", key: "hasEngagementBait" },
  { header: "hasExternalLinkInBody", key: "hasExternalLinkInBody" },
  { header: "charCount", key: "charCount" },
  { header: "judgeModel", key: "judgeModel", width: 16 },
  { header: "judgeTemperature", key: "judgeTemperature" },
  { header: "rubricHash", key: "rubricHash", width: 18 },
  { header: "judgedAt", key: "judgedAt", width: 22 },
  { header: "conteudo", key: "conteudo", width: 60 },
];

const MAPPING_COLUMNS = [
  { header: "post", key: "post" },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "condition", key: "condition", width: 12 },
  { header: "topic", key: "topic", width: 32 },
  { header: "topicKey", key: "topicKey", width: 32 },
];

function metricsRow(s: StudySample) {
  const j = s.judgement;
  return {
    post: s.post,
    threadId: s.threadId,
    topic: s.topic,
    topicKey: s.topicKey,
    condition: s.condition,
    createdAt: s.createdAt,
    status: s.status,
    revisionCount: s.revisionCount ?? "",
    judgeRetries: s.judgeRetries ?? "",
    score: j.score,
    hookQuality: j.hookQuality,
    originality: j.originality,
    scannability: j.scannability,
    ctaQuality: j.ctaQuality,
    lengthAdequate: j.lengthAdequate,
    toneLinkedIn: j.toneLinkedIn,
    hasEngagementBait: j.hasEngagementBait,
    hasExternalLinkInBody: j.hasExternalLinkInBody,
    charCount: s.draft.length,
    // Procedência: vazio nas execuções anteriores ao registro de JudgeRunMeta.
    judgeModel: s.judgeMeta?.model ?? "",
    judgeTemperature: s.judgeMeta?.temperature ?? "",
    rubricHash: s.judgeMeta?.rubricHash ?? "",
    judgedAt: s.judgeMeta?.judgedAt ?? "",
    conteudo: s.draft,
  };
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const { samples, excluded, topics } = await getStudySelection();

  if (format === "posts") {
    // Texto pronto pra colar no Google Form — condição oculta, só o rótulo.
    const body = samples
      .map((s) => `### Post ${s.post}\n\n${s.draft}\n`)
      .join("\n---\n\n");
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (format === "mapping") {
    return sheetResponse(
      MAPPING_COLUMNS,
      samples.map((s) => ({
        post: s.post,
        threadId: s.threadId,
        condition: s.condition,
        topic: s.topic,
        topicKey: s.topicKey,
      })),
      "mapping.csv",
    );
  }

  if (format === "csv" || format === "xlsx") {
    return sheetResponse(COLUMNS, samples.map(metricsRow), `agent-metrics.${format}`);
  }

  return NextResponse.json({ samples, excluded, topics });
}
