import { RUBRIC_VERSION } from "../src/app/MAS/lib/rubric";
import {
  CORPUS_MAX_POSTS,
  formOrder,
  selectCorpus,
} from "../src/app/MAS/lib/studyCorpus";
import type { RunMetaRecord, VersionRecord } from "../src/app/MAS/lib/studyRecorder";
import type { Decision } from "../src/app/MAS/types/types";

// Testa a REGRA do corpus com dados sintéticos.
//   pnpm test:corpus-rule
//
// Existe pelo mesmo motivo do test-sample-rule: o banco real não tem execução
// suficiente para exercitar dedupe por tópico, teto, exclusão por instrumento
// antigo e — o que mais importa — a ESTABILIDADE das letras quando execuções
// novas entram. Um remapeamento silencioso faria as respostas coletadas
// apontarem para o post errado, sem erro nenhum aparecer.
// `selectCorpus` é função pura (runs + históricos), então dá para provocar cada ramo.

let falhas = 0;

function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

function run(
  threadId: string,
  topic: string,
  createdAt: string,
  excludedAt: string | null = null,
): RunMetaRecord {
  return {
    threadId,
    topic,
    topicNorm: topic.toLowerCase(),
    status: "awaiting_review",
    judgeLoop: true,
    writerModel: "",
    revisionCount: 0,
    judgeRetries: 0,
    createdAt,
    completedAt: null,
    excludedAt,
    excludedReason: excludedAt ? "descartada no teste" : null,
  };
}

/**
 * Histórico de uma execução. `nota` controla o ramo testado:
 *   "accept" | "reject" — v1 avaliada no instrumento vigente
 *   "v1"                — nota na rubrica antiga (deve ser excluída)
 *   "nenhuma"           — sem nota
 *   "vazio"             — sem versão nenhuma
 */
function history(
  threadId: string,
  createdAt: string,
  nota: "accept" | "reject" | "v1" | "nenhuma" | "vazio",
  versoes = 1,
): VersionRecord[] {
  if (nota === "vazio") return [];
  const decision: Decision = nota === "accept" ? "ACCEPT" : "REJECT";
  const dim = nota === "accept" ? 4 : 2;
  return Array.from({ length: versoes }, (_, i) => ({
    id: `${threadId}-v${i + 1}`,
    threadId,
    version: i + 1,
    content: `draft ${threadId} v${i + 1}`,
    charCount: 1400 + i,
    trigger: i === 0 ? ("initial" as const) : ("judge_retry" as const),
    createdAt,
    judgement:
      nota === "nenhuma"
        ? null
        : {
            clarity: dim,
            relevance: dim,
            professional: dim,
            engagement: dim,
            overall: dim,
            decision,
            hasEngagementBait: false,
            hasExternalLinkInBody: false,
            lengthOk: true,
            issues: [],
            suggestions: [],
          },
    judgeMeta:
      nota === "nenhuma"
        ? null
        : {
            model: "gpt-4o",
            temperature: 0.1,
            rubricHash: "abc123",
            rubricVersion: nota === "v1" ? "v1" : RUBRIC_VERSION,
            judgedAt: createdAt,
          },
  }));
}

function select(
  specs: [string, string, string, Parameters<typeof history>[2], number?][],
  descartados: string[] = [],
) {
  const runs = specs.map(([id, topic, at]) =>
    run(id, topic, at, descartados.includes(id) ? at : null),
  );
  const histories = new Map(
    specs.map(([id, , at, nota, versoes]) => [
      id,
      history(id, at, nota, versoes ?? 1),
    ]),
  );
  return selectCorpus(runs, histories);
}

const dia = (n: number) => `2026-09-${String(n).padStart(2, "0")}T00:00:00.000Z`;

// ── 1. Só a v1 entra, mesmo com a execução tendo várias versões ─────────────
console.log("1. a unidade é a v1");
{
  const { items, stats } = select([["a", "tema a", dia(1), "accept", 4]]);
  const dentro = items.filter((i) => i.inCorpus);
  check("uma execução rende UM post", dentro.length === 1, `${dentro.length}`);
  check("e é a versão 1", dentro[0]?.version === 1, `v${dentro[0]?.version}`);
  check("corpus = 1", stats.corpus === 1);
}

// ── 2. Exclusões ────────────────────────────────────────────────────────────
console.log("\n2. exclusões");
{
  const { items, stats } = select(
    [
      ["ok", "tema ok", dia(1), "accept"],
      ["velha", "tema velho", dia(2), "v1"],
      ["sem", "tema sem", dia(3), "nenhuma"],
      ["vazia", "tema vazio", dia(4), "vazio"],
      ["desc", "tema desc", dia(5), "accept"],
    ],
    ["desc"],
  );
  const motivo = (id: string) =>
    items.find((i) => i.threadId === id)?.exclusion ?? null;
  check("rubrica antiga fica fora", motivo("velha") === "instrumento_v1");
  check("sem nota fica fora", motivo("sem") === "sem_nota");
  check("sem versão fica fora", motivo("vazia") === "sem_versao");
  check("descartada fica fora", motivo("desc") === "run_descartado");
  check("sobra só a elegível", stats.corpus === 1, `${stats.corpus}`);
  check(
    "toda execução aparece no registro",
    items.length === 5,
    `${items.length}`,
  );
}

// ── 3. Um post por tópico: vence o mais antigo ─────────────────────────────
console.log("\n3. dedupe por tópico");
{
  const { items, stats } = select([
    ["nova", "Mesmo Tema", dia(5), "accept"],
    ["antiga", "mesmo tema", dia(2), "accept"],
    ["outra", "outro tema", dia(3), "accept"],
  ]);
  const dentro = items.filter((i) => i.inCorpus).map((i) => i.threadId);
  check("a mais antiga do tópico vence", dentro.includes("antiga"));
  check("a repetida fica fora", !dentro.includes("nova"));
  check(
    "com o motivo registrado",
    items.find((i) => i.threadId === "nova")?.exclusion === "topico_repetido",
  );
  check("tópicos distintos = 2", stats.topicos === 2, `${stats.topicos}`);
}

// ── 4. Teto do formulário ──────────────────────────────────────────────────
console.log("\n4. teto");
{
  const specs = Array.from(
    { length: CORPUS_MAX_POSTS + 3 },
    (_, i) =>
      [`t${i}`, `tema ${i}`, dia((i % 28) + 1), "accept"] as [
        string,
        string,
        string,
        "accept",
      ],
  );
  // createdAt cíclico de propósito: força o desempate por threadId.
  const { items, stats } = select(specs);
  check(
    `corpus limitado a ${CORPUS_MAX_POSTS}`,
    stats.corpus === CORPUS_MAX_POSTS,
    `${stats.corpus}`,
  );
  check(
    "excedentes marcados",
    stats.excluded.acima_do_teto === 3,
    `${stats.excluded.acima_do_teto}`,
  );
  check(
    "só quem está no corpus tem rótulo",
    items.every((i) => (i.label !== null) === i.inCorpus),
  );
}

// ── 5. ESTABILIDADE: execução nova não remapeia letras já distribuídas ─────
console.log("\n5. estabilidade das letras (o requisito que quebra a coleta)");
{
  const base: [string, string, string, "accept"][] = [
    ["a", "tema a", dia(1), "accept"],
    ["b", "tema b", dia(2), "accept"],
    ["c", "tema c", dia(3), "accept"],
  ];
  const antes = select(base);
  const mapa = (sel: ReturnType<typeof select>) =>
    Object.fromEntries(
      sel.items.filter((i) => i.inCorpus).map((i) => [i.threadId, i.label]),
    );
  const m1 = mapa(antes);

  // Execução NOVA (mais recente) entra depois de o form ir a campo.
  const depois = select([...base, ["d", "tema d", dia(9), "accept"]]);
  const m2 = mapa(depois);
  check(
    "as letras antigas não se movem",
    ["a", "b", "c"].every((id) => m1[id] === m2[id]),
    JSON.stringify(m2),
  );
  check("a nova recebe a letra seguinte", m2["d"] === "D", `${m2["d"]}`);

  // E uma execução ANTIGA que chega atrasada? Ela entra na frente da fila —
  // este é o resíduo assumido, e o teste existe para que ele seja uma decisão
  // consciente e não uma surpresa no meio da coleta.
  const atrasada = select([...base, ["z", "tema z", dia(1), "accept"]]);
  const m3 = mapa(atrasada);
  check(
    "execução antiga inserida atrasada REMAPEIA (resíduo conhecido)",
    m3["b"] !== m1["b"] && m3["c"] !== m1["c"],
    JSON.stringify(m3),
  );
  console.log(
    "    i uma execução com createdAt anterior aos que já estão no corpus\n" +
      "      desloca as letras. Se o form já foi a campo, reexporte o mapping\n" +
      "      antes de cruzar as respostas.",
  );
}

// ── 6. Equilíbrio ACCEPT/REJECT ────────────────────────────────────────────
console.log("\n6. equilíbrio (bandeira de matriz degenerada)");
{
  const todosAccept = select(
    Array.from(
      { length: 6 },
      (_, i) =>
        [`a${i}`, `tema ${i}`, dia(i + 1), "accept"] as [
          string,
          string,
          string,
          "accept",
        ],
    ),
  );
  check(
    "corpus só de ACCEPT levanta a bandeira",
    todosAccept.stats.balanceWarning,
    `balance=${todosAccept.stats.balance}`,
  );

  const misto = select([
    ["a", "tema a", dia(1), "accept"],
    ["b", "tema b", dia(2), "accept"],
    ["c", "tema c", dia(3), "accept"],
    ["d", "tema d", dia(4), "reject"],
    ["e", "tema e", dia(5), "reject"],
    ["f", "tema f", dia(6), "reject"],
  ]);
  check(
    "corpus equilibrado não levanta",
    !misto.stats.balanceWarning,
    `balance=${misto.stats.balance}`,
  );
  check("accept/reject contados", misto.stats.accept === 3 && misto.stats.reject === 3);

  // Corpus pequeno demais: o balanço é 0 por aritmética, não por viés.
  const minusculo = select([["a", "tema a", dia(1), "accept"]]);
  check(
    "corpus de 1 post NÃO levanta a bandeira",
    !minusculo.stats.balanceWarning,
    `balance=${minusculo.stats.balance}`,
  );
  check(
    "avaliações esperadas = corpus × raters",
    misto.stats.avaliacoesEsperadas === misto.stats.corpus * misto.stats.raters,
  );
}

// ── 7. Ordem do formulário ─────────────────────────────────────────────────
console.log("\n7. ordem do formulário");
{
  const sel = select(
    Array.from(
      { length: 8 },
      (_, i) =>
        [`o${i}`, `tema ${i}`, dia(i + 1), "accept"] as [
          string,
          string,
          string,
          "accept",
        ],
    ),
  );
  const ordem = formOrder(sel.items);
  check("todos os posts do corpus aparecem", ordem.length === sel.stats.corpus);
  check(
    "e nenhum de fora entra",
    ordem.every((i) => i.inCorpus && i.label),
  );
  const alfabetica = ordem.map((i) => i.label).join("");
  const ordenada = [...ordem.map((i) => i.label)].sort().join("");
  check("a ordem não é alfabética (não entrega a data)", alfabetica !== ordenada, alfabetica);
  check(
    "e é reprodutível entre chamadas",
    formOrder(sel.items).map((i) => i.label).join("") === alfabetica,
  );
}

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
