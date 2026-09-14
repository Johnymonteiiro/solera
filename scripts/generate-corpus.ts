import crypto from "node:crypto";
import net from "node:net";
import {
  FORM_TOPICS,
  writerModelFor,
  type FormTopic,
} from "../study/form-topics";
import { GRAPH_RECURSION_LIMIT } from "../src/app/MAS/constants";
import { getGraph } from "../src/app/MAS/graph/graph";
import { flushCheckpointer } from "../src/app/MAS/lib/checkpointer";
import { AGENT_IDS, getAgentConfig } from "../src/app/MAS/lib/configStore";
import { RUBRIC_VERSION } from "../src/app/MAS/lib/rubric";
import {
  FORM_MAX_POSTS,
  MAX_SAMPLE_PAIRS,
  selectRevisionPairs,
} from "../src/app/MAS/lib/revisionPairs";
import {
  getAllVersionHistories,
  listRunMeta,
} from "../src/app/MAS/lib/studyRecorder";
import { createThread } from "../src/app/MAS/lib/threadStore";
import { normalizeTopic } from "../src/app/MAS/lib/topic";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Gera o corpus do estudo em lote.
//
//   pnpm corpus:generate                 → PLANO (não gasta nada)
//   pnpm corpus:generate --go            → executa os tópicos que faltam
//   pnpm corpus:generate --go --limit 1  → executa UM (o teste de fumaça)
//
// ── judgeLoop = true, sempre ────────────────────────────────────────────────
//
// A unidade do formulário humano voltou a ser o PAR antes/depois: a v1 que o
// Judge reprovou contra a última versão que a crítica dele produziu. Ver
// `src/app/MAS/lib/revisionPairs.ts`, que é a fonte de verdade da seleção.
//
// Isso INVERTE a decisão anterior deste script. Enquanto a unidade era o post
// individual (v1 de toda execução), o loop era desperdício: gastava crédito
// produzindo versões que o estudo não usava. Agora é o contrário — sem o loop
// não existe "depois", e o lote inteiro rende ZERO pares.
//
// Consequência de custo, assumida: uma execução reprovada passa por writer +
// judge de novo a cada retry, até ACCEPT ou MAX_JUDGE_RETRIES. As aprovadas de
// primeira custam o mesmo de antes e NÃO rendem par — é o desenho, não uma
// falha (ver `stats.firstPassRate`, que tem que ser reportado junto).
//
// ── Por que exige --go ──────────────────────────────────────────────────────
//
// Cada tópico é uma cadeia researcher → analyst → writer → judge: várias
// chamadas de LLM mais buscas na API do navegador. Rodar a lista inteira sem
// querer custa dinheiro de verdade e enche o corpus de execuções que depois
// teriam que ser descartadas à mão. O default é imprimir o plano.
//
// ── NÃO RODE COM O DEV SERVER DE PÉ ────────────────────────────────────────
//
// O checkpointer é um arquivo único (`data/checkpoints.json`) que cada processo
// hidrata UMA vez, na construção, e reescreve INTEIRO a cada checkpoint. Dois
// processos gravando = o último a escrever apaga os threads do outro, sem erro
// nenhum. O script recusa começar se achar servidor na porta do Next (--force
// ignora, por sua conta).
//
// ── Retomável ───────────────────────────────────────────────────────────────
//
// Pula tópico cujo NORMALIZADO já existe entre as execuções do dono E que já
// produziu um DRAFT. As duas condições importam: uma execução que morreu no
// meio (researcher pendurado, chave sem crédito) deixa a linha em `runs` sem
// versão nenhuma, e checar só o tópico faria esse tópico ficar bloqueado para
// sempre — foi o que aconteceu com a execução que travou em `researching`.
// Refazer é seguro: a tentativa sem draft é excluída do corpus por `sem_versao`
// antes do dedupe por tópico, então ela não rouba a vaga da boa.

const args = process.argv.slice(2);
const go = args.includes("--go");
const force = args.includes("--force");
const limitArg = args.indexOf("--limit");
const limit =
  limitArg >= 0 ? Math.max(1, Number(args[limitArg + 1]) || 1) : Infinity;

function fmt(t: FormTopic, i: number): string {
  const modelo = writerModelFor(FORM_TOPICS.indexOf(t)) || "config global";
  return (
    `  ${String(i + 1).padStart(2)}. [${t.intent.padEnd(9)}] ` +
    `[dif ${t.dificuldade.padEnd(5)}] [${modelo.padEnd(13)}] ${t.topic}`
  );
}

/**
 * Há algo escutando na porta do Next? Ver "NÃO RODE COM O DEV SERVER DE PÉ".
 *
 * Socket TCP cru, não `fetch`: a pergunta é sobre a PORTA, não sobre uma
 * resposta HTTP. E o fetch do undici deixa um socket keep-alive pendurado que,
 * no `process.exit` logo em seguida, derruba o processo com assertion do libuv
 * no Windows em vez de encerrar limpo — foi exatamente o que aconteceu aqui.
 */
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

  // ANTES de qualquer acesso ao banco, de propósito. Com o pool do Postgres
  // já aberto, `process.exit` sai por cima de handles vivos e o libuv derruba
  // o processo com assertion em vez de encerrar limpo (visto no Windows).
  if (go && (await devServerNoAr())) {
    if (!force) {
      console.error(
        `\n✗ Há um servidor respondendo na porta ${process.env.PORT ?? "3000"}.\n\n` +
          `  O lote e o dev server compartilham data/checkpoints.json, que é\n` +
          `  reescrito INTEIRO por processo. Rodando juntos, um apaga os\n` +
          `  checkpoints do outro — sem erro, sem aviso.\n\n` +
          `  Pare o dev server e rode de novo (ou --force, por sua conta).\n`,
      );
      process.exitCode = 1;
      return;
    }
    console.warn(
      `⚠ dev server no ar e --force passado: os checkpoints podem se atropelar.`,
    );
  }


  // Tópicos já COBERTOS: existe execução do dono que gravou um draft E que pode
  // render par (`judgeLoop`). As duas condições importam:
  //
  //   - sem draft = tentativa morta (researcher pendurado, chave sem crédito).
  //     Não conta, senão o tópico dela ficaria bloqueado para sempre.
  //   - com judgeLoop=false o Judge pontuou mas não reescreveu: não existe
  //     "depois", e `revisionPairs` exclui esses pares como `sem_loop_do_judge`.
  //     Contar essas execuções como cobertura bloquearia justamente os tópicos
  //     que o formulário precisa. Nenhuma execução está nesse estado hoje (as 13
  //     do banco têm loop=true, vieram da UI) — é guarda para quem rodar um lote
  //     com o loop desligado e depois quiser os pares desses mesmos tópicos.
  const [meta, historicos] = await Promise.all([
    listRunMeta(ownerId),
    getAllVersionHistories(ownerId),
  ]);
  const comDraft = meta.filter(
    (r) => (historicos.get(r.threadId)?.length ?? 0) > 0,
  );
  const mortas = meta.length - comDraft.length;
  const uteis = comDraft.filter((r) => r.judgeLoop);
  const semLoop = comDraft.length - uteis.length;
  const existentes = new Set(uteis.map((r) => r.topicNorm));
  const pendentes = FORM_TOPICS.filter(
    (t) => !existentes.has(normalizeTopic(t.topic)),
  );
  const aRodar = pendentes.slice(0, limit === Infinity ? undefined : limit);

  console.log(
    `\ncorpus: ${FORM_TOPICS.length} tópicos na lista · ` +
      `${FORM_TOPICS.length - pendentes.length} já executados · ` +
      `${pendentes.length} pendentes · teto do form = ${MAX_SAMPLE_PAIRS} pares ` +
      `(${FORM_MAX_POSTS} posts)`,
  );
  if (mortas > 0) {
    console.log(
      `${mortas} execução(ões) sem draft no banco — tentativas mortas. ` +
        `Os tópicos delas voltam para a fila.`,
    );
  }
  if (semLoop > 0) {
    console.log(
      `${semLoop} execução(ões) com judgeLoop=false — pontuadas mas nunca ` +
        `reescritas, então não rendem par. Os tópicos delas voltam para a fila;\n` +
        `  as execuções seguem no banco e continuam alimentando o corpus de v1.`,
    );
  }

  // Não há mais aviso de "lista maior que o teto". Com a unidade sendo o par,
  // só execução REPROVADA na v1 rende item de formulário — então uma lista
  // maior que o teto é o REMÉDIO (mais chances de reprovar), não um problema.
  // O que pode faltar é par, e disso o resumo final cuida.

  if (!aRodar.length) {
    console.log("\nNada a fazer — todos os tópicos da lista já foram executados.\n");
    await closeDb();
    process.exit(0);
  }

  if (!go) {
    console.log(`\nPLANO (${aRodar.length} execuções, nada foi gasto):`);
    aRodar.forEach((t, i) => console.log(fmt(t, i)));
    console.log(
      `\nCada execução gasta crédito de LLM + buscas.\n` +
        `Para executar:  pnpm corpus:generate --go\n` +
        `Para testar 1:  pnpm corpus:generate --go --limit 1\n`,
    );
    await closeDb();
    process.exit(0);
  }

  // O judge é o tratamento: é ele que pontua a v1, reprova e provoca a
  // reescrita que forma o par. `disabledAgents` respeita a config de /agentes
  // para os DEMAIS agentes — o judge nunca entra nessa lista (ver o filtro
  // abaixo), então este lote roda com ele ligado independente da config.
  const agentConfig = await getAgentConfig();
  if (!agentConfig.judge.enabled) {
    console.warn(
      "⚠ judge está DESATIVADO em /agentes, mas este lote o usa mesmo assim:\n" +
        "  judgeLoop=true é cravado no script e o judge não entra em disabledAgents.\n" +
        "  Sem ele não há nota nem reescrita, e o lote renderia zero pares.",
    );
  }
  const disabledAgents = AGENT_IDS.filter(
    (id) => id !== "judge" && !agentConfig[id].enabled,
  );

  const graph = getGraph();
  const resultados: {
    topic: string;
    threadId: string;
    nota: string;
    retries: number;
  }[] = [];
  const falhas: { topic: string; erro: string }[] = [];

  console.log(`\nexecutando ${aRodar.length} tópicos (sequencial)…\n`);

  for (const [i, t] of aRodar.entries()) {
    const threadId = `thread_${crypto.randomBytes(4).toString("hex")}`;
    process.stdout.write(
      `[${i + 1}/${aRodar.length}] ${t.topic.slice(0, 58).padEnd(58)} `,
    );
    try {
      // Awaited: draft_versions referencia runs.thread_id, então a linha do run
      // tem que existir antes de o writer gravar a v1.
      // Condição pela POSIÇÃO NA LISTA, não pela posição na fila de pendentes:
      // assim o modelo de um tópico não muda conforme o que já foi executado.
      const writerModel = writerModelFor(FORM_TOPICS.indexOf(t));
      const criado = await createThread(
        ownerId,
        threadId,
        t.topic,
        t.postSize,
        true, // judgeLoop — ver o cabeçalho
        writerModel,
      );
      if (!criado) throw new Error("thread_conflict");

      // Sequencial e AGUARDADO (a rota HTTP é fire-and-forget): o lote precisa
      // saber o que aconteceu em cada tópico, e disparar 24 cadeias em paralelo
      // derrubaria o lote inteiro no rate limit da OpenAI.
      await graph.invoke(
        {
          topic: t.topic,
          navigatorProvider: "tavily",
          language: "pt-BR",
          postSize: t.postSize,
          judgeLoop: true,
          writerModel,
          disabledAgents,
        },
        {
          configurable: { thread_id: threadId },
          recursionLimit: GRAPH_RECURSION_LIMIT,
        },
      );

      // O grafo para no interrupt do HITL — depois de ACCEPT ou de esgotar
      // MAX_JUDGE_RETRIES. É o estado esperado, e é ali que a execução fica: o
      // estudo não precisa de aprovação humana, só das versões e das notas.
      const snap = await graph.getState({ configurable: { thread_id: threadId } });
      const j = snap?.values?.judgement;
      // `judgement` aqui é a nota FINAL, não a da v1 — com o loop ligado elas só
      // coincidem quando não houve reescrita. Quem rende par é `judgeRetries>0`;
      // a contagem de verdade sai do resumo, pela regra do revisionPairs.
      const retries = snap?.values?.judgeRetries ?? 0;
      const nota = j?.overall
        ? `${retries > 0 ? `${retries}× reescrita → PAR` : "1ª passada, sem par"} · ` +
          `final ${j.decision} ${j.overall}/5 (c${j.clarity} r${j.relevance} p${j.professional} e${j.engagement})`
        : `sem nota — status ${snap?.values?.status ?? "?"}`;
      console.log(nota);
      resultados.push({ topic: t.topic, threadId, nota, retries });
    } catch (err) {
      const erro = err instanceof Error ? err.message : String(err);
      console.log(`FALHOU — ${erro}`);
      falhas.push({ topic: t.topic, erro });
    }
  }

  const comNota = resultados.filter((r) => !r.nota.startsWith("sem nota"));
  const reprovadas = comNota.filter((r) => r.retries > 0).length;

  console.log(
    `\n${resultados.length} execuções · ${comNota.length} com nota · ${falhas.length} falhas`,
  );
  console.log(
    `${reprovadas} reprovada(s) na v1 neste lote — só elas rendem par ` +
      `(instrumento ${RUBRIC_VERSION})`,
  );

  // A contagem que VALE sai da regra do estudo, relendo o banco: reimplementar
  // aqui a definição de par é exatamente como os dois lados divergem em
  // silêncio. E execuções de lotes anteriores contam para encher o formulário,
  // então o número deste lote sozinho não responde "já dá para ir a campo?".
  const { stats } = selectRevisionPairs(
    await listRunMeta(ownerId),
    await getAllVersionHistories(ownerId),
  );
  console.log(
    `pares elegíveis ${stats.pairsLoop} · na amostra do form ` +
      `${stats.pairsNaAmostra}/${MAX_SAMPLE_PAIRS} pares ` +
      `(${stats.versoesRotuladas}/${FORM_MAX_POSTS} posts rotulados)`,
  );
  if (stats.firstPassRate !== null) {
    console.log(
      `aprovados de 1ª: ${stats.firstPass}/${stats.runsAvaliados} ` +
        `(${(stats.firstPassRate * 100).toFixed(0)}%) — ressalva 1 do revisionPairs: ` +
        `reportar SEMPRE junto com qualquer efeito medido nos pares`,
    );
  }
  if (stats.pairsNaAmostra < MAX_SAMPLE_PAIRS) {
    console.warn(
      `\n⚠ o formulário não enche: faltam ${MAX_SAMPLE_PAIRS - stats.pairsNaAmostra} par(es).\n` +
        `  Só execução REPROVADA na v1 rende par; as aprovadas de primeira não.\n` +
        `  A saída é ACRESCENTAR tópicos que reprovem em study/form-topics.ts e\n` +
        `  rodar de novo — NÃO escolher a dedo quais posts entram no formulário.`,
    );
  }
  if (falhas.length) {
    console.log("\nfalhas (rode de novo — o script é retomável):");
    for (const f of falhas) console.log(`  - ${f.topic}\n    ${f.erro}`);
  }
  // Flush SÍNCRONO antes de sair. O checkpointer persiste com debounce de 200ms
  // e writeFile assíncrono: `process.exit` mata a escrita pendente e o último
  // checkpoint some. Os dados do corpus estão no Postgres (não dependem disto),
  // mas sem checkpoint o HITL não consegue retomar o thread.
  flushCheckpointer();
  console.log(
    "\nConfira os pares em /estudo ou em GET /api/mas/export/revision-pairs\n" +
      "Textos cegos para montar o Form: ?format=posts · chave de junção: ?format=mapping\n",
  );
  await closeDb();
  process.exit(0);
}

// Ctrl+C no meio do lote é o caso NORMAL de uso (foi como a primeira passada
// terminou). Sem isto, o checkpoint do tópico em andamento se perde.
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
