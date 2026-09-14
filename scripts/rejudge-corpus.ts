import { flushCheckpointer } from "../src/app/MAS/lib/checkpointer";
import { getCorpusSelection } from "../src/app/MAS/lib/studyCorpus";
import { recordJudgement } from "../src/app/MAS/lib/studyRecorder";
import { getJudgeModelName } from "../src/app/MAS/models/openAI/llm";
import { currentRubricHash, scoreDraft } from "../src/app/MAS/nodes/judge.node";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Re-pontua o corpus inteiro com o Judge ATUAL.
//
//   pnpm corpus:rejudge         → mostra o que seria refeito (não gasta nada)
//   pnpm corpus:rejudge --go    → re-pontua
//
// ── Por que isto precisa existir ────────────────────────────────────────────
//
// Notas produzidas por juízes diferentes NÃO se comparam dentro do mesmo
// corpus. Trocar o modelo do Judge, o prompt ou a rubrica cria exatamente essa
// situação: metade dos posts avaliada por um juiz, metade por outro, e qualquer
// correlação calculada em cima disso mistura duas medidas.
//
// O sintoma não aparece sozinho — as colunas continuam preenchidas e o CSV
// continua abrindo. O que denuncia é `judgements.model` / `rubric_hash` /
// `rubric_version` divergindo entre linhas do mesmo corpus, e é isso que este
// script imprime antes de mexer em qualquer coisa.
//
// ── O que ele NÃO faz ───────────────────────────────────────────────────────
//
// Não gera post nenhum e não toca em `draft_versions`. Os textos são exatamente
// os mesmos; só a avaliação é refeita. `recordJudgement` faz UPDATE na linha da
// versão (draftVersionId é unique) e reescreve a procedência junto — sem isso a
// nota nova ficaria carimbada com o juiz antigo.

const args = process.argv.slice(2);
const go = args.includes("--go");

async function main() {
  const ownerId = ownerFromEnv();
  const modeloAtual = await getJudgeModelName();
  const { items } = await getCorpusSelection(ownerId);
  const hashAtual = await currentRubricHash();
  const corpus = items.filter((i) => i.inCorpus);

  if (!corpus.length) {
    console.log("\nCorpus vazio — nada a re-pontuar.\n");
    return;
  }

  // Divergência de procedência: é o diagnóstico que justifica rodar isto.
  const porModelo = new Map<string, number>();
  for (const i of corpus) {
    const m = i.judgeMeta
      ? `${i.judgeMeta.model} / ${i.judgeMeta.rubricHash}`
      : "(sem procedencia)";
    porModelo.set(m, (porModelo.get(m) ?? 0) + 1);
  }

  console.log(`\ncorpus: ${corpus.length} posts · judge atual: ${modeloAtual}`);
  console.log("notas existentes por modelo:");
  for (const [m, n] of porModelo) {
    const marca =
      m === `${modeloAtual} / ${hashAtual}` ? "ok" : "DESATUALIZADA";
    console.log(`  ${String(m).padEnd(30)} ${String(n).padStart(3)} post(s)  ${marca}`);
  }

  // Procedencia DESATUALIZADA e modelo OU rubricHash divergindo do juiz de
  // agora. So o modelo nao bastava: mudar o prompt (o gate, as ancoras, o
  // contrato de saida) troca o juiz sem trocar o modelo, e o script dizia "nada
  // a fazer" com o corpus inteiro pontuado por outro instrumento. Foi o que
  // aconteceu em 2026-09-08, quando a regra de aceitacao mudou.
  const desatualizados = corpus.filter(
    (i) =>
      i.judgeMeta?.model !== modeloAtual || i.judgeMeta?.rubricHash !== hashAtual,
  );
  if (!desatualizados.length) {
    console.log("\nTodo o corpus já está no juiz atual — nada a fazer.\n");
    return;
  }

  if (!go) {
    console.log(
      `\n${desatualizados.length} post(s) seriam re-pontuados (nada foi gasto).\n` +
        `Para executar:  pnpm corpus:rejudge --go\n`,
    );
    return;
  }

  console.log(`\nre-pontuando ${desatualizados.length} post(s)…\n`);
  let ok = 0;
  const falhas: string[] = [];

  // Sequencial: são chamadas pagas e o rate limit derruba o lote inteiro se
  // dispararmos tudo de uma vez.
  for (const [n, item] of desatualizados.entries()) {
    process.stdout.write(
      `[${n + 1}/${desatualizados.length}] ${(item.label ?? "?").padEnd(3)} ` +
        `${item.topic.slice(0, 44).padEnd(44)} `,
    );
    const antes = item.judgement;
    // postSize não é lido do run de propósito: `lengthOk` é determinístico e
    // precisa da MESMA faixa que valeu na avaliação original, senão a flag muda
    // por um motivo que não é o juiz.
    const { judgement, meta } = await scoreDraft({
      topic: item.topic,
      draft: item.content,
      postSize: "medium",
    });
    if (!judgement) {
      console.log("FALHOU (parse)");
      falhas.push(item.label ?? item.threadId);
      continue;
    }
    await recordJudgement({
      threadId: item.threadId,
      draft: item.content,
      judgement,
      meta,
    });
    const de = antes ? `${antes.decision} ${antes.overall}/5` : "—";
    console.log(`${de} → ${judgement.decision} ${judgement.overall}/5`);
    ok++;
  }

  console.log(`\n${ok} re-pontuado(s), ${falhas.length} falha(s)`);
  if (falhas.length) console.log(`falharam: ${falhas.join(", ")}`);
  console.log(
    "\n⚠ Se o formulário humano JÁ foi a campo com as notas antigas, as\n" +
      "  respostas continuam válidas (o humano avaliou o TEXTO, que não mudou),\n" +
      "  mas a comparação passa a ser contra o juiz novo. Registre isso.\n",
  );
}

main()
  .then(async () => {
    flushCheckpointer();
    await closeDb();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
