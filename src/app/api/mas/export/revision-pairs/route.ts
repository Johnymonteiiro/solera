import { NextRequest, NextResponse } from "next/server";
import {
  PairVersion,
  RevisionPair,
  formOrder,
  getRevisionSelection,
} from "@/app/MAS/lib/revisionPairs";
import { countVersions, getRevisionPairs } from "@/app/MAS/lib/studyRecorder";
import { sheetResponse } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Export do desenho antes/depois.
//
// O par do ESTUDO (`kind=loop`) é v1 × última versão do loop do judge — é o que
// responde "a revisão do agente melhorou o post?". Os pares consecutivos
// (`kind=consecutive`) isolam uma crítica cada e ficam no dataset como material
// de mecanismo; não recebem rótulo cego nem vão ao form.
//
//   GET /api/mas/export/revision-pairs                  → JSON { pairs, runs, stats }
//   GET /api/mas/export/revision-pairs?threadId=X       → JSON de UMA execução
//   GET /api/mas/export/revision-pairs?format=csv|xlsx  → 1 linha por PAR (wide)
//   GET /api/mas/export/revision-pairs?format=versions  → 1 linha por VERSÃO (long)
//   GET /api/mas/export/revision-pairs?format=runs      → 1 linha por EXECUÇÃO
//   GET /api/mas/export/revision-pairs?format=posts     → textos cegos p/ o Form
//   GET /api/mas/export/revision-pairs?format=mapping   → rótulo ↔ versão/par
//
// ESCOPO, que é diferente por formato: `versions`, `posts` e `mapping` cobrem a
// AMOSTRA do form (1 par por execução, 1 por tópico, até FORM_MAX_POSTS —
// regra em revisionPairs.ts). `csv`/`xlsx` cobrem TODOS os pares, com
// `eligible`/`inSample` como colunas de filtro: é o registro auditável, e é lá
// que se vê o que ficou de fora e por quê.
//
// Espelha o contrato do agent-metrics de propósito (mesmos nomes de formato,
// mesmo mapping gerado aqui em vez de montado à mão) — foi a maior fonte de
// erro no cruzamento com o Google Forms.
//
// Os dois formatos tabulares existem porque a análise precisa dos dois: o WIDE
// dá o teste pareado direto (delta por par); o LONG é o que casa com as
// respostas humanas, que chegam por rótulo de post, não por par.
//
// ATENÇÃO ao usar: `format=runs` NÃO é um anexo opcional. É onde estão os
// aprovados de primeira — os casos de efeito zero que os pares, por construção,
// não contêm. Reportar delta dos pares sem a taxa de aprovação de primeira é
// seleção em variável pós-tratamento.

const PAIR_COLUMNS = [
  { header: "pairId", key: "pairId", width: 46 },
  { header: "kind", key: "kind", width: 12 },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "topic", key: "topic", width: 32 },
  { header: "topicKey", key: "topicKey", width: 32 },
  { header: "cause", key: "cause", width: 16 },
  { header: "eligible", key: "eligible" },
  { header: "excludeReason", key: "excludeReason", width: 18 },
  { header: "inSample", key: "inSample" },
  { header: "sampleExclusion", key: "sampleExclusion", width: 18 },
  { header: "exhausted", key: "exhausted" },
  { header: "status", key: "status", width: 14 },
  { header: "createdAt", key: "createdAt", width: 22 },
  { header: "beforeLabel", key: "beforeLabel" },
  { header: "beforeVersion", key: "beforeVersion" },
  { header: "beforeScore", key: "beforeScore" },
  { header: "beforeHook", key: "beforeHook" },
  { header: "beforeOriginality", key: "beforeOriginality" },
  { header: "beforeScannability", key: "beforeScannability" },
  { header: "beforeCta", key: "beforeCta" },
  { header: "beforeChars", key: "beforeChars" },
  { header: "afterLabel", key: "afterLabel" },
  { header: "afterVersion", key: "afterVersion" },
  { header: "afterScore", key: "afterScore" },
  { header: "afterHook", key: "afterHook" },
  { header: "afterOriginality", key: "afterOriginality" },
  { header: "afterScannability", key: "afterScannability" },
  { header: "afterCta", key: "afterCta" },
  { header: "afterChars", key: "afterChars" },
  { header: "deltaScore", key: "deltaScore" },
  { header: "deltaChars", key: "deltaChars" },
  { header: "rubricHash", key: "rubricHash", width: 18 },
  // O texto vai junto: a tela expõe só .csv/.xlsx, então um download tem que
  // bastar para montar o formulário sem voltar aqui por outro formato.
  { header: "beforeConteudo", key: "beforeConteudo", width: 60 },
  { header: "afterConteudo", key: "afterConteudo", width: 60 },
];

const VERSION_COLUMNS = [
  { header: "post", key: "post" },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "version", key: "version" },
  { header: "role", key: "role", width: 10 },
  { header: "pairId", key: "pairId", width: 46 },
  { header: "topic", key: "topic", width: 32 },
  { header: "trigger", key: "trigger", width: 16 },
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

const RUN_COLUMNS = [
  { header: "threadId", key: "threadId", width: 38 },
  { header: "topic", key: "topic", width: 32 },
  { header: "topicKey", key: "topicKey", width: 32 },
  { header: "outcome", key: "outcome", width: 16 },
  { header: "judgeLoop", key: "judgeLoop" },
  { header: "versions", key: "versions" },
  { header: "judgeRetries", key: "judgeRetries" },
  { header: "revisionCount", key: "revisionCount" },
  { header: "exhausted", key: "exhausted" },
  { header: "firstScore", key: "firstScore" },
  { header: "finalScore", key: "finalScore" },
  { header: "status", key: "status", width: 14 },
  { header: "createdAt", key: "createdAt", width: 22 },
  { header: "excludedAt", key: "excludedAt", width: 22 },
  { header: "excludedReason", key: "excludedReason", width: 30 },
];

const MAPPING_COLUMNS = [
  { header: "post", key: "post" },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "version", key: "version" },
  { header: "role", key: "role", width: 10 },
  { header: "pairId", key: "pairId", width: 46 },
  { header: "topic", key: "topic", width: 32 },
];

function pairRow(p: RevisionPair) {
  const b = p.before.judgement;
  const a = p.after.judgement;
  return {
    pairId: p.pairId,
    kind: p.kind,
    threadId: p.threadId,
    topic: p.topic,
    topicKey: p.topicKey,
    cause: p.cause,
    eligible: p.eligible,
    excludeReason: p.excludeReason ?? "",
    inSample: p.inSample,
    sampleExclusion: p.sampleExclusion ?? "",
    exhausted: p.exhausted,
    status: p.status,
    createdAt: p.createdAt,
    beforeLabel: p.before.label ?? "",
    beforeVersion: p.before.version,
    beforeScore: b?.score ?? "",
    beforeHook: b?.hookQuality ?? "",
    beforeOriginality: b?.originality ?? "",
    beforeScannability: b?.scannability ?? "",
    beforeCta: b?.ctaQuality ?? "",
    beforeChars: p.before.charCount,
    afterLabel: p.after.label ?? "",
    afterVersion: p.after.version,
    afterScore: a?.score ?? "",
    afterHook: a?.hookQuality ?? "",
    afterOriginality: a?.originality ?? "",
    afterScannability: a?.scannability ?? "",
    afterCta: a?.ctaQuality ?? "",
    afterChars: p.after.charCount,
    deltaScore: p.deltaScore ?? "",
    deltaChars: p.deltaChars,
    // Procedência da nota do "depois": se as duas versões de um par foram
    // julgadas com rubrics diferentes, o delta não significa nada. A checagem
    // vive no check_provenance() do quality_study.py.
    rubricHash: p.after.judgeMeta?.rubricHash ?? "",
    beforeConteudo: p.before.content,
    afterConteudo: p.after.content,
  };
}

/** Uma versão vira linha em cada papel que ocupa (v2 é "depois" e "antes"). */
function versionRow(
  p: RevisionPair,
  v: PairVersion,
  role: "antes" | "depois",
  withContent: boolean,
) {
  const j = v.judgement;
  return {
    post: v.label ?? "",
    threadId: p.threadId,
    version: v.version,
    role,
    pairId: p.pairId,
    topic: p.topic,
    trigger: v.trigger,
    score: j?.score ?? "",
    hookQuality: j?.hookQuality ?? "",
    originality: j?.originality ?? "",
    scannability: j?.scannability ?? "",
    ctaQuality: j?.ctaQuality ?? "",
    lengthAdequate: j?.lengthAdequate ?? "",
    toneLinkedIn: j?.toneLinkedIn ?? "",
    hasEngagementBait: j?.hasEngagementBait ?? "",
    hasExternalLinkInBody: j?.hasExternalLinkInBody ?? "",
    charCount: v.charCount,
    judgeModel: v.judgeMeta?.model ?? "",
    judgeTemperature: v.judgeMeta?.temperature ?? "",
    rubricHash: v.judgeMeta?.rubricHash ?? "",
    judgedAt: v.judgeMeta?.judgedAt ?? "",
    ...(withContent ? { conteudo: v.content } : {}),
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const format = params.get("format");
  const threadId = params.get("threadId");

  // Uma execução só: histórico completo, sem rótulo cego (é visão de
  // diagnóstico, não amostra do form).
  if (threadId) {
    const [versions, pairs] = await Promise.all([
      countVersions(threadId),
      getRevisionPairs(threadId),
    ]);
    return NextResponse.json({ threadId, versions, pairs });
  }

  const { pairs, runs, stats } = await getRevisionSelection();
  // Os formatos voltados ao form humano usam a AMOSTRA (1 par por execução, 1
  // por tópico, até o teto de posts), não todos os pares válidos: rotular o
  // dataset inteiro daria letras a textos que ninguém vai avaliar.
  const sample = pairs.filter((p) => p.inSample);

  if (format === "posts") {
    // Ordem embaralhada (formOrder), NÃO alfabética: as duas versões de um par
    // recebem letras consecutivas, então listar por rótulo as poria lado a lado
    // e o avaliador veria dois textos quase idênticos em sequência. Nem tópico
    // nem par aparecem aqui, pelo mesmo motivo.
    const body = formOrder(pairs)
      .map((v) => `### Post ${v.label}\n\n${v.content}\n`)
      .join("\n---\n\n");
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (format === "mapping") {
    const rows = sample.flatMap((p) => [
      {
        post: p.before.label ?? "",
        threadId: p.threadId,
        version: p.before.version,
        role: "antes",
        pairId: p.pairId,
        topic: p.topic,
      },
      {
        post: p.after.label ?? "",
        threadId: p.threadId,
        version: p.after.version,
        role: "depois",
        pairId: p.pairId,
        topic: p.topic,
      },
    ]);
    return sheetResponse(MAPPING_COLUMNS, rows, "mapping-pairs.csv");
  }

  if (format === "versions") {
    const rows = sample.flatMap((p) => [
      versionRow(p, p.before, "antes", true),
      versionRow(p, p.after, "depois", true),
    ]);
    return sheetResponse(VERSION_COLUMNS, rows, "revision-versions.csv");
  }

  if (format === "runs") {
    return sheetResponse(
      RUN_COLUMNS,
      runs.map((r) => ({ ...r, excludedAt: r.excludedAt ?? "", excludedReason: r.excludedReason ?? "" })),
      "revision-runs.csv",
    );
  }

  if (format === "csv" || format === "xlsx") {
    // Inclui os pares inelegíveis: o CSV é o registro auditável do que existe,
    // e a coluna `eligible` é o filtro. Sumir com eles aqui esconderia
    // exatamente os casos que precisam de explicação no artigo.
    return sheetResponse(PAIR_COLUMNS, pairs.map(pairRow), `revision-pairs.${format}`);
  }

  return NextResponse.json({ pairs, runs, stats });
}
