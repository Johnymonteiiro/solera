import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/app/MAS/graph/graph";
import { getVersionHistory } from "@/app/MAS/lib/studyRecorder";
import { getThread } from "@/app/MAS/lib/threadStore";
import { requireArea } from "@/lib/dal";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;

  const { threadId } = await params;

  // A POSSE VEM PRIMEIRO, e é o banco que decide. O checkpoint do LangGraph não
  // conhece dono: ler o snapshot antes entregaria draft, insights e
  // researchResults de QUALQUER thread para quem soubesse o id.
  const stored = await getThread(ownerId, threadId);
  if (!stored) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const graph = getGraph();
  const snapshot = await graph.getState({
    configurable: { thread_id: threadId },
  });

  // Histórico de versões: vem do registro do estudo, não do checkpoint. É o
  // único lugar que sabe QUANTAS reescritas o judge pediu — `judgeRetries`
  // conta junto as passadas de revisão humana, e o state só guarda o draft
  // corrente. Sem o texto: a tela precisa do placar, não de N cópias do post.
  const history = await getVersionHistory(ownerId, threadId);

  const values = snapshot?.values ?? {};

  // Fallback: quando o checkpoint está vazio/perdido (ex: thread antigo após
  // restart), completa os artefatos com o que foi espelhado no threadStore.
  // Sem isso, insights/researchResults sumiam pois só viviam no checkpoint.
  const nonEmpty = <T>(v: T[] | undefined): T[] | undefined =>
    v && v.length > 0 ? v : undefined;

  return NextResponse.json({
    threadId,
    // Status do threadStore tem prioridade: ele reflete o ciclo de eventos ao
    // vivo (inclui awaiting_review). O checkpoint fica em "judging" quando o
    // HITL está pausado no interrupt (o nó ainda não retornou estado).
    status: stored?.status ?? values.status ?? "idle",
    researchResults:
      nonEmpty(values.researchResults) ?? stored?.researchResults ?? [],
    insights: nonEmpty(values.insights) ?? stored?.insights ?? [],
    draft: values.draft || stored?.draft || "",
    judgement: values.judgement ?? stored?.judgement ?? null,
    humanFeedback: values.humanFeedback ?? null,
    revisionCount: values.revisionCount ?? stored?.revisionCount ?? 0,
    judgeRetries: values.judgeRetries ?? stored?.judgeRetries ?? 0,
    stoppedReason: values.stoppedReason ?? null,
    postSize: values.postSize ?? stored?.postSize ?? "medium",
    finalPostUrl: values.finalPostUrl ?? null,
    versions: history.map((v) => ({
      version: v.version,
      trigger: v.trigger,
      charCount: v.charCount,
      overall: v.judgement?.overall ?? null,
      decision: v.judgement?.decision ?? null,
    })),
  });
}
