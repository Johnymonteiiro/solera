import { AIMessage } from "@langchain/core/messages";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LINKEDIN_MAX_CHARS, POST_SIZE_RANGES } from "../src/app/MAS/constants";
import { composeSystemPrompt, getAgentConfig } from "../src/app/MAS/lib/configStore";
import { DEFAULT_LANGUAGE } from "../src/app/MAS/lib/language";
import { RUBRIC_DIMENSIONS, RUBRIC_VERSION } from "../src/app/MAS/lib/rubric";
import { listRunInputs, type RunInputsRecord } from "../src/app/MAS/lib/studyRecorder";
import { getJudgeModelName } from "../src/app/MAS/models/openAI/llm";
import { scoreDraft } from "../src/app/MAS/nodes/judge.node";
import { writerPrompt } from "../src/app/MAS/prompts/writer.prompt";
import { writerAgent } from "../src/app/MAS/agents/writer.agent";
import type { JudgeResult } from "../src/app/MAS/types/types";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Experimento dos braços: o writer com pesquisa COMPLETA vs. RACIONADA.
//
//   pnpm arms                        → PLANO (não gasta nada)
//   pnpm arms --go                   → roda os braços full e zero
//   pnpm arms --go --arms full,thin,zero  → dose-resposta completa
//   pnpm arms --go --limit 2         → teste de fumaça
//
// ── A PERGUNTA ──────────────────────────────────────────────────────────────
//
// O corpus não tem reprovação: 16 posts, 16 ACCEPT, com `relevance` valendo
// EXATAMENTE 3 em 15 deles — um ponto acima do limiar, na mesma dimensão.
// Cinco alavancas já foram testadas sem mover a nota (ver study/ACHADOS.md §3):
// prompt do analyst, prompt do writer, temperatura, dificuldade do tópico e
// modelo do writer.
//
// As cinco mexem em FORMA. As âncoras de `relevance` separam 2 de 3 por
// SUBSTÂNCIA:
//
//   3 — "Informação correta, porém previsível. Cobre o básico do tópico."
//   2 — "Genérico. Senso comum e afirmações amplas sem substância."
//
// Um writer competente alimentado com pesquisa real sempre "cobre o básico".
// Nunca se tirou substância dele — a alavanca 1 foi na direção contrária
// (MAX_CHARACTERS de 500 para 2000, ou seja, MAIS material). É essa a alavanca
// que falta puxar, e é o que este script faz.
//
// ── O DESENHO ───────────────────────────────────────────────────────────────
//
// Mesmo tópico, MESMA pesquisa, só a quantidade de insights entregue ao writer
// muda. Tudo o mais fica constante — prompt, modelo, temperatura, tamanho alvo,
// e o judge roda idêntico e às cegas nos dois braços.
//
//   full — todos os insights gravados (controle; é o pipeline de hoje)
//   thin — 2 insights, o piso que a guarda do writer aceita (writer.node.ts:58)
//   zero — nenhum insight
//
// O `zero` é o braço que importa. O `thin` existe pela dose-resposta, e com uma
// ressalva medida: uma execução com 1 fonte e 3 insights JÁ passou no gate, o
// que sugere que racionar pouco não basta.
//
// Os dois resultados possíveis servem ao artigo:
//   - `zero` reprova → a célula REJECT existe, e com mecanismo identificado.
//   - `zero` NÃO reprova → o juiz aprova post escrito sem pesquisa nenhuma, que
//     é falso-aceite na veia e um achado mais forte que o primeiro.
//
// ── POR QUE NÃO GRAVA NO BANCO ──────────────────────────────────────────────
//
// Estes posts NÃO nascem do grafo: não passam por researcher nem analyst, e o
// braço é uma condição experimental que não tem coluna em `runs`. Gravá-los
// agora produziria execuções indistinguíveis do corpus real — exatamente a
// contaminação silenciosa que a guarda do analyst acabou de fechar.
//
// Então isto é um PILOTO: mede se a alavanca funciona e salva tudo (drafts,
// notas, procedência) num JSON. Se o `zero` reprovar, o passo seguinte é a
// migration com a coluna da condição e a geração pra valer — aí sim no banco,
// rotulado, entrando no corpus pela regra normal.
//
// ── AMEAÇA À VALIDADE, declarada ────────────────────────────────────────────
//
// No braço `zero` o writer recebe um aviso de que não há pesquisa (ver
// SENTINELA_SEM_PESQUISA). É o mínimo para a tarefa continuar bem-formada — sem
// isso a mensagem do usuário iria vazia e o modelo tende a responder sobre a
// falta de entrada em vez de escrever o post. O aviso descreve a condição, não
// instrui qualidade, mas é uma diferença de prompt entre os braços e tem que ser
// reportada como tal.

const args = process.argv.slice(2);
const go = args.includes("--go");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const limitRaw = Number(argValue("--limit"));
const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : Infinity;

/** Quantos insights cada braço entrega. `null` = todos. */
const ARM_BUDGET = {
  full: null,
  thin: 2,
  zero: 0,
} as const;

type Arm = keyof typeof ARM_BUDGET;

const armsArg = argValue("--arms");
const arms: Arm[] = (armsArg ? armsArg.split(",") : ["full", "zero"])
  .map((a) => a.trim())
  .filter((a): a is Arm => a in ARM_BUDGET);

if (!arms.length) {
  console.error(`--arms inválido. Use: ${Object.keys(ARM_BUDGET).join(",")}`);
  process.exit(1);
}

const SENTINELA_SEM_PESQUISA =
  "(nenhum insight de pesquisa disponível para este tópico — escreva assim mesmo)";

/**
 * Recorte determinístico dos insights.
 *
 * Os N PRIMEIROS na ordem gravada, não uma amostra sorteada: o mesmo run tem que
 * render o mesmo braço em qualquer máquina e em qualquer rodada, senão o
 * experimento não é reproduzível e a comparação entre braços mistura a dose com
 * qual insight caiu.
 */
function budgetFor(insights: string[], arm: Arm): string[] {
  const n = ARM_BUDGET[arm];
  return n === null ? insights : insights.slice(0, n);
}

function extractLastAiContent(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const lastAi = [...messages]
    .reverse()
    .find((m) => AIMessage.isInstance(m)) as AIMessage | undefined;
  return typeof lastAi?.content === "string" ? lastAi.content : "";
}

/**
 * Escreve um post fora do grafo.
 *
 * Espelha writer.node.ts (montagem do prompt, composeSystemPrompt, corte em
 * LINKEDIN_MAX_CHARS) menos o que é de state: sem draft anterior, sem feedback
 * humano, sem gravação de versão. O que NÃO pode divergir é a montagem do
 * prompt — se divergir, o braço `full` deixa de ser o controle do pipeline.
 *
 * Passa por fora da guarda `insights.length < MIN_INSIGHTS` do nó, que abortaria
 * o braço `zero` antes de escrever. A guarda continua certa para o pipeline; o
 * experimento é justamente sobre o que acontece do outro lado dela.
 */
async function escrever(
  run: RunInputsRecord,
  insights: string[],
): Promise<string> {
  const targetRange = POST_SIZE_RANGES[run.postSize];
  const insightsList = insights.length
    ? insights.map((ins, i) => `${i + 1}. ${ins}`).join("\n")
    : SENTINELA_SEM_PESQUISA;

  // O corpus do estudo é todo em português e o `runs` não grava idioma — a
  // condição experimental aqui é a dose de pesquisa, não a língua.
  let prompts = writerPrompt({
    topic: run.topic,
    language: DEFAULT_LANGUAGE,
    previousDraftBlock: "",
    feedbackBlock: "",
    insightsList,
    targetRange,
  });
  const writerCfg = (await getAgentConfig()).writer;
  prompts = composeSystemPrompt(
    writerCfg.role,
    writerCfg.promptOverride,
    prompts,
    "prepend",
  );

  // modelOverride vazio de propósito: o modelo do writer é a alavanca 5, já
  // testada e nula. Aqui ele é CONSTANTE — deixá-lo variar confundiria a dose de
  // pesquisa com a condição de modelo.
  const { response } = await writerAgent({
    prompts,
    insightsList,
    modelOverride: "",
  });
  const draft = extractLastAiContent(response.messages);
  return draft.length > LINKEDIN_MAX_CHARS
    ? draft.slice(0, LINKEDIN_MAX_CHARS)
    : draft;
}

interface Resultado {
  threadId: string;
  topic: string;
  postSize: string;
  arm: Arm;
  insightsUsados: number;
  insightsDisponiveis: number;
  draft: string;
  chars: number;
  judgement: JudgeResult | null;
  judgeModel: string;
  rubricHash: string;
}

function vetor(j: JudgeResult): string {
  return RUBRIC_DIMENSIONS.map((d) => j[d.key]).join(",");
}

async function main() {
  const ownerId = ownerFromEnv();
  const todos = await listRunInputs(ownerId);

  // Só execuções com pesquisa COMPLETA podem ser racionadas: um run que já saiu
  // com 2 insights não tem o que tirar, e entraria no braço `full` como se fosse
  // controle sendo, ele mesmo, uma condição rala.
  const vistos = new Set<string>();
  const elegiveis = todos
    .filter((r) => r.insights.length > ARM_BUDGET.thin)
    .filter((r) => {
      if (vistos.has(r.topicNorm)) return false;
      vistos.add(r.topicNorm);
      return true;
    })
    .slice(0, limit === Infinity ? undefined : limit);

  const semPesquisa = todos.length - vistos.size;

  console.log(
    `\nbraços: ${arms.join(", ")} · ${elegiveis.length} tópico(s) elegível(is) ` +
      `de ${todos.length} execução(ões)` +
      (semPesquisa > 0 ? ` (${semPesquisa} sem insights suficientes ou tópico repetido)` : ""),
  );

  if (!elegiveis.length) {
    console.log(
      "\nNenhuma execução com insights suficientes para racionar.\n" +
        "Gere corpus primeiro:  pnpm corpus:generate --go\n",
    );
    return;
  }

  const chamadas = elegiveis.length * arms.length;
  console.log(
    `custo: ${chamadas} chamada(s) de writer + ${chamadas} de judge ` +
      `(judge ${await getJudgeModelName()}, instrumento ${RUBRIC_VERSION})\n`,
  );

  for (const r of elegiveis) {
    const doses = arms
      .map((a) => `${a}=${budgetFor(r.insights, a).length}`)
      .join(" ");
    console.log(
      `  ${r.topic.slice(0, 52).padEnd(52)} ${String(r.insights.length).padStart(2)} insights → ${doses}`,
    );
  }

  if (!go) {
    console.log(`\nPlano — nada foi gasto. Para executar:  pnpm arms --go\n`);
    return;
  }

  console.log("");
  const resultados: Resultado[] = [];

  // Sequencial: são chamadas pagas e o rate limit derruba o lote inteiro se
  // dispararmos tudo de uma vez (mesmo motivo do rejudge-corpus).
  for (const [n, run] of elegiveis.entries()) {
    console.log(`[${n + 1}/${elegiveis.length}] ${run.topic.slice(0, 60)}`);
    for (const arm of arms) {
      const insights = budgetFor(run.insights, arm);
      process.stdout.write(
        `    ${arm.padEnd(5)} (${String(insights.length).padStart(2)} insights) `,
      );

      const draft = await escrever(run, insights);
      if (!draft.trim()) {
        console.log("FALHOU (writer devolveu vazio)");
        continue;
      }

      const { judgement, meta } = await scoreDraft({
        topic: run.topic,
        draft,
        postSize: run.postSize,
      });

      resultados.push({
        threadId: run.threadId,
        topic: run.topic,
        postSize: run.postSize,
        arm,
        insightsUsados: insights.length,
        insightsDisponiveis: run.insights.length,
        draft,
        chars: draft.length,
        judgement,
        judgeModel: meta.model,
        rubricHash: meta.rubricHash,
      });

      console.log(
        judgement
          ? `${String(draft.length).padStart(4)}ch  ${vetor(judgement)} → ${judgement.overall}/5  ${judgement.decision}`
          : `${String(draft.length).padStart(4)}ch  FALHOU (parse do judge)`,
      );
    }
  }

  // ── Balanço por braço: é a leitura que decide o próximo passo ──────────────
  console.log(`\n── balanço ──`);
  for (const arm of arms) {
    const doBraco = resultados.filter((r) => r.arm === arm && r.judgement);
    if (!doBraco.length) {
      console.log(`  ${arm.padEnd(5)} sem resultado`);
      continue;
    }
    const rejeitados = doBraco.filter((r) => r.judgement!.decision === "REJECT");
    const medias = RUBRIC_DIMENSIONS.map((d) => {
      const m =
        doBraco.reduce((s, r) => s + r.judgement![d.key], 0) / doBraco.length;
      return `${d.key.slice(0, 4)} ${m.toFixed(2)}`;
    }).join("  ");
    const pct = ((rejeitados.length / doBraco.length) * 100).toFixed(0);
    console.log(
      `  ${arm.padEnd(5)} REJECT ${String(rejeitados.length).padStart(2)}/${doBraco.length} (${pct}%)   ${medias}`,
    );
  }

  // `relevance` em detalhe: é a dimensão que decide o gate hoje (3 em 15 de 16).
  console.log(`\n── distribuição de relevance ──`);
  for (const arm of arms) {
    const doBraco = resultados.filter((r) => r.arm === arm && r.judgement);
    if (!doBraco.length) continue;
    const dist = new Map<number, number>();
    for (const r of doBraco) {
      const v = r.judgement!.relevance;
      dist.set(v, (dist.get(v) ?? 0) + 1);
    }
    const linha = [1, 2, 3, 4, 5]
      .map((n) => `${n}:${dist.get(n) ?? 0}`)
      .join("  ");
    console.log(`  ${arm.padEnd(5)} ${linha}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out =
    argValue("--out") ?? path.join("study", "data", `arms-${stamp}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        rubricVersion: RUBRIC_VERSION,
        arms,
        armBudget: ARM_BUDGET,
        sentinelaSemPesquisa: SENTINELA_SEM_PESQUISA,
        resultados,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `\nartefatos em ${out}\n` +
      `(nada foi gravado no banco — ver "POR QUE NÃO GRAVA NO BANCO" no cabeçalho)\n`,
  );
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
