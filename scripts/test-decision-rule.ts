import { MAX_JUDGE_RETRIES } from "../src/app/MAS/constants";
import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  coherenceViolations,
  composite,
  conformanceFailures,
  decide,
  floorViolated,
} from "../src/app/MAS/lib/rubric";
import { routeAfterJudge } from "../src/app/MAS/graph/graph";
import type { State } from "../src/app/MAS/states/states";
import type {
  JudgeFinding,
  JudgeResult,
  RubricDimensionKey,
} from "../src/app/MAS/types/types";

// Testa a REGRA de decisão e a verificação de coerência, sem tocar em LLM nem
// em banco.
//   pnpm test:decision
//
// Existe porque estas duas regras decidem o comportamento do pipeline inteiro —
// o que volta para o writer e o que vai para o humano — e porque a anterior
// (`toda dimensão ≥ 3`) aceitou 22 de 22 execuções sem nunca disparar o loop.
// Uma regra de gate que ninguém exercita é uma regra que ninguém sabe se separa
// alguma coisa.
//
// Os vetores vêm de casos REAIS: `4,3,4,3` é o que o corpus produz em quase toda
// execução, e os dois posts de 2026-09-08 que motivaram a mudança viram
// `4,3,3,3` e `4,3,2,3` depois da correção de coerência.

let falhas = 0;

function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

function v(
  clarity: number,
  relevance: number,
  professional: number,
  engagement: number,
): Record<RubricDimensionKey, number> {
  return { clarity, relevance, professional, engagement };
}

console.log(
  `\nregra: composto ≥ ${ACCEPT_COMPOSITE_MIN} e piso (duas dimensões < ${ACCEPT_MIN}, uma delas clareza ou relevância)\n`,
);

console.log("── composto ──");
check("4,3,4,3 (típico do corpus) = 3,50", composite(v(4, 3, 4, 3)) === 3.5);
check(
  "4,3,3,3 = 3,35",
  Math.abs(composite(v(4, 3, 3, 3)) - 3.35) < 1e-9,
  composite(v(4, 3, 3, 3)).toFixed(2),
);
check(
  "4,1,4,4 = 2,95 (relevância pesa: forma não compra aprovação)",
  Math.abs(composite(v(4, 1, 4, 4)) - 2.95) < 1e-9,
  composite(v(4, 1, 4, 4)).toFixed(2),
);
check("5,5,5,5 = 5", composite(v(5, 5, 5, 5)) === 5);
check("1,1,1,1 = 1", composite(v(1, 1, 1, 1)) === 1);

console.log("\n── decisão ──");
check("4,3,4,3 ACCEPT (passa raspando)", decide(v(4, 3, 4, 3)) === "ACCEPT");
check("4,3,3,3 REJECT (post 2 coerente)", decide(v(4, 3, 3, 3)) === "REJECT");
check("4,3,2,3 REJECT (post 1 coerente)", decide(v(4, 3, 2, 3)) === "REJECT");
check("4,1,4,4 REJECT pela média", decide(v(4, 1, 4, 4)) === "REJECT");
check("5,4,4,4 ACCEPT", decide(v(5, 4, 4, 4)) === "ACCEPT");

console.log("\n── piso ──");
check(
  "2,4,2,4: composto 3,00 mas duas abaixo (uma é clareza) → REJECT",
  composite(v(2, 4, 2, 4)) === 3 && decide(v(2, 4, 2, 4)) === "REJECT",
  `composto ${composite(v(2, 4, 2, 4))}`,
);
// Regressão do resíduo de ponto flutuante: com pesos fracionários este vetor
// dava 2,9999999999999996 e um vetor no corte exato podia reprovar por binário.
check(
  "composto não acumula resíduo (soma em centésimos)",
  composite(v(4, 3, 4, 3)) === 3.5 && composite(v(2, 4, 2, 4)) === 3,
);
check(
  "uma dimensão baixa sozinha NÃO aciona o piso (3,2,5,5)",
  floorViolated(v(3, 2, 5, 5)) === false,
);
check(
  "duas baixas sem clareza nem relevância não acionam o piso (4,4,2,2)",
  floorViolated(v(4, 4, 2, 2)) === false,
);
check(
  "…mas 4,4,2,2 reprova pela média (3,00)",
  decide(v(4, 4, 2, 2)) === "REJECT",
);

console.log("\n── coerência ──");
const findings = (
  items: [RubricDimensionKey | "format", number | null][],
): JudgeFinding[] =>
  items.map(([dimension, anchor], i) => ({
    dimension,
    anchor,
    text: `issue ${i}`,
  }));

check(
  "nota 4 com issue de âncora 2 na mesma dimensão → violação",
  coherenceViolations(v(4, 3, 4, 3), findings([["professional", 2]]))[0]
    ?.worstAnchor === 2,
);
check(
  "nota igual à âncora citada → sem violação",
  coherenceViolations(v(4, 3, 2, 3), findings([["professional", 2]])).length ===
    0,
);
check(
  "vale o PIOR ponto citado na dimensão",
  coherenceViolations(
    v(4, 4, 4, 4),
    findings([
      ["relevance", 4],
      ["relevance", 2],
    ]),
  )[0]?.worstAnchor === 2,
);
check(
  "issue de `format` não mexe em nota nenhuma",
  coherenceViolations(v(5, 5, 5, 5), findings([["format", null]])).length === 0,
);
check(
  "dimensão sem issue não é tocada",
  coherenceViolations(v(5, 5, 5, 5), findings([["clarity", 5]])).length === 0,
);

console.log("\n── conformidade (fora da decisão, aciona o loop) ──");
const conf = (
  lengthOk: boolean,
  hasExternalLinkInBody: boolean,
  hasEngagementBait: boolean,
) => conformanceFailures({ lengthOk, hasExternalLinkInBody, hasEngagementBait });
check("tudo ok → nenhuma falha", conf(true, false, false).length === 0);
check("fora da faixa → 1 falha", conf(false, false, false).length === 1);
check("as três juntas → 3 falhas", conf(false, true, true).length === 3);

console.log("\n── roteamento depois do judge ──");

function judgement(
  scores: Record<RubricDimensionKey, number>,
  flags: Partial<Pick<JudgeResult, "lengthOk" | "hasEngagementBait" | "hasExternalLinkInBody">> = {},
): JudgeResult {
  return {
    ...scores,
    overall: 3,
    decision: decide(scores),
    hasEngagementBait: false,
    hasExternalLinkInBody: false,
    lengthOk: true,
    issues: [],
    suggestions: [],
    ...flags,
  };
}

const rota = (j: JudgeResult, judgeRetries = 0, judgeLoop = true) =>
  routeAfterJudge({ judgement: j, judgeRetries, judgeLoop } as State);

check(
  "qualidade reprovada → volta ao writer",
  rota(judgement(v(4, 3, 3, 3))) === "writer",
);
check(
  "qualidade ok e conforme → segue para o humano",
  rota(judgement(v(4, 3, 4, 3))) === "hitl",
);
// O caso que motivou tudo: ACCEPT nas notas, 1.202 chars num alvo de 500–900.
check(
  "ACCEPT na qualidade mas fora da faixa → volta ao writer",
  rota(judgement(v(4, 3, 4, 3), { lengthOk: false })) === "writer",
);
check(
  "ACCEPT com engagement bait → volta ao writer",
  rota(judgement(v(4, 3, 4, 3), { hasEngagementBait: true })) === "writer",
);
check(
  "ACCEPT com link no corpo → volta ao writer",
  rota(judgement(v(4, 3, 4, 3), { hasExternalLinkInBody: true })) === "writer",
);
check(
  "teto de reescritas vence a conformidade (não gira para sempre)",
  rota(judgement(v(4, 3, 3, 3), { lengthOk: false }), MAX_JUDGE_RETRIES) === "hitl",
);
check(
  "judgeLoop=false: pontua e vai direto ao humano",
  rota(judgement(v(4, 3, 3, 3), { lengthOk: false }), 0, false) === "hitl",
);

console.log(
  falhas === 0
    ? "\ntodas as checagens passaram\n"
    : `\n${falhas} checagem(ns) falharam\n`,
);
process.exit(falhas === 0 ? 0 : 1);
