/**
 * Migra data/threads.json → Postgres.
 *
 * Limitação herdada, importante e não contornável aqui: o threadStore só
 * guardava UM draft e UMA judgement por execução (o estado final). Logo cada
 * run migrado nasce com **uma única** draftVersion — a última. Os v1 reprovados
 * pelo judge não existem nesse arquivo e não podem ser inventados.
 *
 * Consequência prática: as execuções migradas NÃO têm par antes/depois. Elas
 * entram como registro histórico; o dataset do estudo novo começa a valer das
 * execuções rodadas depois desta migração.
 *
 * Idempotente: rodar duas vezes não duplica (onConflictDoNothing/Update).
 *
 *   pnpm db:migrate-json
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { draftVersions, getDb, judgements, runs } from "../src/db";
import { normalizeTopic } from "../src/app/MAS/lib/topic";
import { ownerFromEnv } from "./owner";

type LegacyThread = {
  threadId: string;
  topic?: string;
  postSize?: string;
  judgeLoop?: boolean;
  criticLoop?: boolean;
  status?: string;
  createdAt?: string;
  completedAt?: string | null;
  revisionCount?: number | null;
  judgeRetries?: number | null;
  draft?: string | null;
  judgement?: Record<string, unknown> | null;
  judgeMeta?: {
    model?: string;
    temperature?: number;
    rubricHash?: string;
    judgedAt?: string;
  } | null;
};

async function main() {
  const file = path.join(process.cwd(), "data", "threads.json");
  if (!fs.existsSync(file)) {
    console.error(`Não achei ${file}`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const list: LegacyThread[] = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed);

  // O threads.json legado é anterior ao conceito de dono: tudo que está lá é de
  // quem rodou o app em localhost, e OWNER_ID é quem assume essa autoria.
  const ownerId = ownerFromEnv();

  const db = getDb();
  let runsIn = 0;
  let versionsIn = 0;
  let judgementsIn = 0;
  let semDraft = 0;

  for (const t of list) {
    if (!t.threadId) continue;
    const topic = t.topic ?? "";
    const createdAt = t.createdAt ? new Date(t.createdAt) : new Date();

    await db
      .insert(runs)
      .values({
        threadId: t.threadId,
        ownerId,
        topic,
        topicNorm: normalizeTopic(topic),
        postSize: t.postSize ?? "medium",
        judgeLoop: t.judgeLoop ?? t.criticLoop ?? true,
        status: t.status ?? "idle",
        revisionCount: t.revisionCount ?? 0,
        judgeRetries: t.judgeRetries ?? 0,
        createdAt,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
      })
      .onConflictDoNothing({ target: runs.threadId });
    runsIn++;

    const draft = t.draft?.trim();
    if (!draft) {
      semDraft++;
      continue;
    }

    // Versão 1 = o único draft que sobreviveu. Ver nota de limitação acima.
    const versionId = randomUUID();
    const inserted = await db
      .insert(draftVersions)
      .values({
        id: versionId,
        threadId: t.threadId,
        version: 1,
        content: draft,
        charCount: draft.length,
        trigger: "initial",
        createdAt,
      })
      .onConflictDoNothing({
        target: [draftVersions.threadId, draftVersions.version],
      })
      .returning({ id: draftVersions.id });

    if (inserted.length === 0) continue; // já migrado
    versionsIn++;

    const j = t.judgement as Record<string, number & boolean & string[]> | null;
    if (!j || !t.judgeMeta?.rubricHash) continue;

    await db
      .insert(judgements)
      .values({
        id: randomUUID(),
        draftVersionId: versionId,
        score: Number(j.score ?? 0),
        hookQuality: Number(j.hookQuality ?? 0),
        originality: Number(j.originality ?? 0),
        scannability: Number(j.scannability ?? 0),
        ctaQuality: Number(j.ctaQuality ?? 0),
        lengthAdequate: Boolean(j.lengthAdequate),
        toneLinkedIn: Boolean(j.toneLinkedIn),
        hasEngagementBait: Boolean(j.hasEngagementBait),
        hasExternalLinkInBody: Boolean(j.hasExternalLinkInBody),
        issues: (j.issues as unknown as string[]) ?? [],
        suggestions: (j.suggestions as unknown as string[]) ?? [],
        model: t.judgeMeta.model ?? "desconhecido",
        temperature: Number(t.judgeMeta.temperature ?? 0),
        rubricHash: t.judgeMeta.rubricHash,
        judgedAt: t.judgeMeta.judgedAt ? new Date(t.judgeMeta.judgedAt) : createdAt,
      })
      .onConflictDoNothing({ target: judgements.draftVersionId });
    judgementsIn++;
  }

  console.log(
    `\nMigrado: ${runsIn} runs, ${versionsIn} versões, ${judgementsIn} notas.\n` +
      `${semDraft} execuções sem draft (não geram versão).\n\n` +
      `⚠ Cada run migrado tem 1 versão só — o threadStore não guardava\n` +
      `  histórico. Nenhum deles forma par antes/depois.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
