import crypto from "node:crypto";
import net from "node:net";
import { GRAPH_RECURSION_LIMIT } from "../src/app/MAS/constants";
import { getGraph } from "../src/app/MAS/graph/graph";
import { flushCheckpointer } from "../src/app/MAS/lib/checkpointer";
import { AGENT_IDS, getAgentConfig } from "../src/app/MAS/lib/configStore";
import { listModels } from "../src/app/MAS/lib/modelStore";
import { composite, RUBRIC_DIMENSIONS, type RubricDimension } from "../src/app/MAS/lib/rubric";
import { getAllVersionHistories, listRunInputs, listRunMeta } from "../src/app/MAS/lib/studyRecorder";
import { createThread } from "../src/app/MAS/lib/threadStore";
import type { PostSize } from "../src/app/MAS/types/types";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Gera um BRAÇO do benchmark: os tópicos do formulário humano, escritos por
// outro modelo do Writer.
//
//   pnpm corpus:generate --model anthropic/claude-sonnet-5              → PLANO
//   pnpm corpus:generate --model anthropic/claude-sonnet-5 --go         → executa
//   pnpm corpus:generate --model anthropic/claude-sonnet-5 --go --limit 1
//
// ── Os tópicos e as condições vêm do corpus original ────────────────────────
//
// A lista não é um arquivo: são as execuções que foram ao formulário (as que
// têm `runs.form_label`, ver drizzle/0013). De cada uma o braço copia o tópico,
// o tamanho do post e o judgeLoop, e roda em pt-BR como o corpus. Só o Writer
// muda — é a única diferença que o benchmark pode ter. (Researcher e Analyst
// rodam de novo, então a pesquisa não é a MESMA; é o mesmo pipeline.)
//
// ── Por que exige --go ──────────────────────────────────────────────────────
//
// Cada tópico é researcher → analyst → writer → judge (+ reescritas se o loop
// estiver ligado e o Judge reprovar): várias chamadas pagas e buscas. O default
// é imprimir o plano.
//
// ── NÃO RODE COM O DEV SERVER DE PÉ ────────────────────────────────────────
//
// O checkpointer é um arquivo único (`data/checkpoints.json`) que cada processo
// hidrata uma vez e reescreve INTEIRO a cada checkpoint. Dois processos
// gravando = o último apaga os threads do outro, sem erro. O script recusa
// começar se achar servidor na porta do Next (--force ignora, por sua conta).
//
// ── Retomável ───────────────────────────────────────────────────────────────
//
// Pula o tópico que já tem execução DESTE modelo com draft gravado. Execução
// sem draft (morreu no meio) não conta, e o tópico volta para a fila.

const args = process.argv.slice(2);
const go = args.includes("--go");
const force = args.includes("--force");
const valorDe = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const modelo = valorDe("--model")?.trim() ?? "";
const limit = valorDe("--limit") ? Math.max(1, Number(valorDe("--limit")) || 1) : Infinity;

interface Topico {
  label: string;
  topic: string;
  postSize: PostSize;
  judgeLoop: boolean;
}

/** Há algo escutando na porta do Next? Socket cru — ver o histórico deste script. */
async function devServerNoAr(): Promise<boolean> {
  const porta = Number(process.env.PORT ?? 3000);
  return new Promise((resolve) => {
    const socket = net.connect({ port: porta, host: "127.0.0.1" });
    const encerra = (aberto: boolean) => {
      socket.destroy();
      resolve(aberto);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => encerra(true));
    socket.once("timeout", () => encerra(false));
    socket.once("error", () => encerra(false));
  });
}

async function main() {
  const ownerId = ownerFromEnv();

  // ANTES de qualquer acesso ao banco: com o pool aberto, `process.exit` sai
  // por cima de handles vivos e o libuv derruba o processo no Windows.
  if (go && (await devServerNoAr())) {
    if (!force) {
      console.error(
        `\n✗ Há um servidor respondendo na porta ${process.env.PORT ?? "3000"}.\n` +
          `  O lote e o dev server compartilham data/checkpoints.json e um apaga os\n` +
          `  checkpoints do outro. Pare o dev server e rode de novo (ou --force).\n`,
      );
      process.exitCode = 1;
      return;
    }
    console.warn("⚠ dev server no ar e --force passado: os checkpoints podem se atropelar.");
  }

  const catalogo = await listModels();
  if (!modelo || !catalogo.some((m) => m.id === modelo)) {
    console.error(
      `\n✗ --model precisa ser um modelo do catálogo (/modelos):\n` +
        catalogo.map((m) => `    ${m.id}`).join("\n") +
        "\n",
    );
    await closeDb();
    process.exitCode = 1;
    return;
  }

  const [meta, historicos, entradas] = await Promise.all([
    listRunMeta(ownerId),
    getAllVersionHistories(ownerId),
    listRunInputs(ownerId),
  ]);
  const tamanhoDe = new Map(entradas.map((r) => [r.threadId, r.postSize]));

  const topicos: Topico[] = meta
    .filter((r) => r.formLabel)
    .map((r) => ({
      label: r.formLabel!,
      topic: r.topic,
      postSize: tamanhoDe.get(r.threadId) ?? "small",
      judgeLoop: r.judgeLoop,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (!topicos.length) {
    console.error("\n✗ Nenhuma execução com letra do formulário (runs.form_label) — nada a replicar.\n");
    await closeDb();
    process.exitCode = 1;
    return;
  }

  // Cobertos: execução deste modelo, com draft, no mesmo tópico normalizado.
  const normDe = new Map(meta.filter((r) => r.formLabel).map((r) => [r.formLabel!, r.topicNorm]));
  const cobertos = new Set(
    meta
      .filter((r) => r.writerModel === modelo && (historicos.get(r.threadId)?.length ?? 0) > 0)
      .map((r) => r.topicNorm),
  );
  const pendentes = topicos.filter((t) => !cobertos.has(normDe.get(t.label)!));
  const aRodar = pendentes.slice(0, limit === Infinity ? undefined : limit);

  console.log(
    `\nbraço ${modelo}: ${topicos.length} tópicos do formulário · ` +
      `${topicos.length - pendentes.length} já gerados · ${pendentes.length} pendentes`,
  );

  if (!aRodar.length) {
    console.log("\nNada a fazer — este modelo já tem todos os tópicos.\n");
    await closeDb();
    process.exit(0);
  }

  if (!go) {
    console.log(`\nPLANO (${aRodar.length} execuções, nada foi gasto):`);
    for (const t of aRodar) {
      console.log(`  ${t.label}  [${t.postSize.padEnd(6)}] [loop ${t.judgeLoop ? "on " : "off"}] ${t.topic}`);
    }
    console.log(`\nPara executar:  pnpm corpus:generate --model ${modelo} --go\n`);
    await closeDb();
    process.exit(0);
  }

  // Os demais agentes respeitam o liga/desliga de /agentes; o judge nunca entra
  // em disabledAgents (sem ele não há nota, e o benchmark é a nota).
  const agentConfig = await getAgentConfig();
  const disabledAgents = AGENT_IDS.filter((id) => id !== "judge" && !agentConfig[id].enabled);
  if (disabledAgents.length) console.warn(`⚠ agentes desativados em /agentes: ${disabledAgents.join(", ")}`);

  const graph = getGraph();
  const falhas: { label: string; erro: string }[] = [];
  let ok = 0;

  console.log(`\nexecutando ${aRodar.length} tópicos com ${modelo} (sequencial)…\n`);

  for (const [i, t] of aRodar.entries()) {
    const threadId = `thread_${crypto.randomBytes(4).toString("hex")}`;
    process.stdout.write(`[${i + 1}/${aRodar.length}] ${t.label} ${t.topic.slice(0, 52).padEnd(52)} `);
    const inicio = Date.now();
    try {
      // Awaited: draft_versions referencia runs.thread_id.
      const criado = await createThread(ownerId, threadId, t.topic, t.postSize, t.judgeLoop, modelo);
      if (!criado) throw new Error("thread_conflict");

      // Sequencial e aguardado: o lote precisa saber o que houve em cada tópico,
      // e cadeias em paralelo esbarrariam em rate limit.
      await graph.invoke(
        {
          topic: t.topic,
          navigatorProvider: "tavily",
          language: "pt-BR",
          postSize: t.postSize,
          judgeLoop: t.judgeLoop,
          writerModel: modelo,
          disabledAgents,
        },
        { configurable: { thread_id: threadId }, recursionLimit: GRAPH_RECURSION_LIMIT },
      );

      // A nota que o benchmark compara é a da V1, gravada no banco — o state
      // guarda a última, que difere quando houve reescrita.
      const v1 = (await getAllVersionHistories(ownerId)).get(threadId)?.[0];
      const j = v1?.judgement;
      const seg = Math.round((Date.now() - inicio) / 1000);
      if (j) {
        const dims = Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d.key, j[d.key]])) as Record<RubricDimension, number>;
        console.log(
          `v1 ${j.decision} composta ${composite(dims).toFixed(2)} ` +
            `(c${j.clarity} r${j.relevance} p${j.professional} e${j.engagement} g${j.overall}) · ${v1.charCount} chars · ${seg}s`,
        );
        ok++;
      } else {
        const snap = await graph.getState({ configurable: { thread_id: threadId } });
        console.log(`sem nota na v1 — status ${snap?.values?.status ?? "?"} · ${seg}s`);
        falhas.push({ label: t.label, erro: `sem nota (status ${snap?.values?.status ?? "?"})` });
      }
    } catch (err) {
      const erro = err instanceof Error ? err.message : String(err);
      console.log(`FALHOU — ${erro.slice(0, 200)}`);
      falhas.push({ label: t.label, erro });
    }
    // Persiste a cada tópico: um Ctrl+C no meio não leva os anteriores.
    flushCheckpointer();
  }

  console.log(`\n${ok} com nota · ${falhas.length} com problema`);
  if (falhas.length) {
    console.log("\nproblemas (rode de novo — o script é retomável):");
    for (const f of falhas) console.log(`  - ${f.label}: ${f.erro.slice(0, 300)}`);
  }
  console.log("\nVeja em /estudo (filtro de modelo) e em /estudo/benchmarks.\n");
  flushCheckpointer();
  await closeDb();
  process.exit(0);
}

// Ctrl+C no meio do lote é caso normal: grava o checkpoint antes de sair.
process.on("SIGINT", () => {
  console.log("\n\ninterrompido — gravando checkpoint antes de sair…");
  flushCheckpointer();
  process.exit(130);
});

main().catch((e) => {
  flushCheckpointer();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
