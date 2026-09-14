import { POST_SIZE_RANGES } from "../constants";
import { Decision, JudgeFinding, PostSize } from "../types/types";

// ─── Instrumento de avaliação (rubrica v2) ───────────────────────────────────
//
// FONTE ÚNICA das dimensões, das âncoras verbais e da regra de aceitação. O
// prompt do Judge, o gate do grafo, os exports e o formulário humano LEEM DAQUI
// — o desenho do estudo exige que o juiz e o avaliador humano respondam ao
// mesmo instrumento, e duas cópias do texto divergem no primeiro ajuste.
//
// Por que v2 (2026-08-28): a v1 media hookQuality/originality/scannability/
// ctaQuality em 0–10, dimensões escolhidas por boas práticas de LinkedIn. A
// pergunta do estudo mudou para "o Critic é um gate confiável quando o humano é
// a referência?" e isso exige simetria — o humano precisa conseguir responder
// exatamente as mesmas perguntas. As quatro dimensões abaixo vieram do desenho
// do orientador (ver Evaluation-Process.md).
//
// TRÊS DECISÕES QUE VIAJAM COM O INSTRUMENTO:
//
//   1. A DECISÃO É CALCULADA, NÃO ELICIADA. O doc sugere que o Critic devolva
//      ACCEPT/REJECT. Aqui a decisão sai da REGRA em código, aplicada
//      identicamente à nota do juiz e à mediana humana. Se o LLM emitisse a
//      decisão, ela poderia divergir das próprias notas dele e a matriz de
//      confusão deixaria de comparar a mesma coisa dos dois lados.
//
//   2. AS PENALIDADES DE ALGORITMO SAÍRAM DAS NOTAS. Na v1, engagement bait ou
//      link no corpo capavam o score em 4. O humano avaliando as mesmas quatro
//      dimensões não aplica cap nenhum, então o cap injetaria divergência
//      juiz–humano que não é sobre percepção. Continuam registradas como flags
//      e como `issues` para o Writer — fora da análise de alinhamento.
//      (Efeito colateral desejado: some o conflito com o HUMAN OVERRIDE, em que
//      um pedido explícito de URL no corpo travava o loop até esgotar retries.)
//
//   3. PARIDADE DE INFORMAÇÃO (§5 do doc). O juiz recebe o TÓPICO junto do
//      texto, porque `relevance` pergunta se o post atende à intenção. Logo o
//      formulário humano TAMBÉM precisa mostrar o tópico. O que o juiz não
//      recebe são as fontes do Researcher — por isso não existe dimensão de
//      veracidade/groundedness aqui.

/** Versão do instrumento. Viaja em JudgeRunMeta e no banco: é o que separa as coletas. */
export const RUBRIC_VERSION = "v2";

/**
 * Piso por dimensão. Já foi o gate inteiro; hoje é uma das duas condições.
 *
 * Continua sendo o corte de leitura da escala — 3 é "Aceitável" — e por isso
 * segue mandando na cor das notas na UI.
 */
export const ACCEPT_MIN = 3;

// ─── A regra de aceitação (mudou em 2026-09-08) ──────────────────────────────
//
// ATÉ AQUI: `ACCEPT ⟺ toda dimensão ≥ 3`, pré-registrada antes da coleta.
//
// POR QUE MUDOU. A regra antiga aceitava tudo o que o pipeline produz: 22 de 22
// execuções `first_pass`, com o vetor `4,3,4,3` em quase todas, e o loop
// judge↔writer nunca disparou uma única vez. O motivo é que 3 é literalmente
// "Aceitável" nas âncoras — um post que o próprio juiz descreve como
// "previsível", "convite pouco específico" e "soa impessoal" é 3 em três
// dimensões e passa. O gate não estava errado: ele estava fazendo o que a regra
// mandava, e a regra não separava nada dentro da faixa que o pipeline ocupa.
//
// A REGRA NOVA tem duas condições, e as duas precisam passar:
//
//   1. COMPOSTO ≥ 3,5 — média ponderada das quatro. Clareza e relevância pesam
//      mais (0,35 cada) porque são as duas que decidem se o texto informa
//      alguma coisa; forma sem substância não deve comprar aprovação.
//   2. PISO — reprova se (clareza < 3 OU relevância < 3) E ao menos outra
//      dimensão < 3. Uma dimensão fraca isolada não reprova (o composto já
//      pune); duas, sendo uma delas de conteúdo, reprovam.
//
// ISTO É DESVIO DE PRÉ-REGISTRO, e está declarado como tal: o 3 foi fixado
// antes de ver os dados, o 3,5 é posterior ao corpus. O artigo tem que dizer
// isso — ver study/ARTIGO-RASCUNHO.md.
//
// Continua valendo o que sempre valeu: a MESMA função decide dos dois lados —
// nota do juiz e mediana humana. É isso que torna a matriz de confusão uma
// comparação legítima, e o formulário humano já coleta as quatro dimensões,
// então o composto é calculável para o humano sem mudar nada no form.

/**
 * Pesos do composto, em centésimos. Somam 100.
 *
 * Inteiros, e não 0,35/0,15, porque a soma ponderada em ponto flutuante erra no
 * limiar: `0,35·2 + 0,35·4 + 0,15·2 + 0,15·4` dá 2,9999999999999996 em vez de
 * 3, e um vetor que caísse exatamente no corte seria reprovado por um resíduo
 * de arredondamento — decisão de gate mudando por causa de binário.
 */
const WEIGHT_BP: Record<RubricDimension, number> = {
  clarity: 35,
  relevance: 35,
  professional: 15,
  engagement: 15,
};

/** Os mesmos pesos como fração, para exibir e documentar. */
export const DIMENSION_WEIGHTS: Record<RubricDimension, number> = {
  clarity: WEIGHT_BP.clarity / 100,
  relevance: WEIGHT_BP.relevance / 100,
  professional: WEIGHT_BP.professional / 100,
  engagement: WEIGHT_BP.engagement / 100,
};

/** Corte do composto para ACCEPT. */
export const ACCEPT_COMPOSITE_MIN = 3.5;

/** Folga de comparação — cobre a mediana humana, que pode ser fracionária. */
const EPSILON = 1e-9;

/**
 * Limiar secundário, para análise de sensibilidade.
 *
 * Não é o gate: existe porque com `ACCEPT_MIN = 3` a base pode ficar degenerada
 * (quase tudo aceito dos dois lados), e κ sobre uma matriz com três células
 * vazias não diz nada. Reportar as duas leituras é decisão de análise, tomada
 * ANTES de ver as respostas humanas.
 */
export const ACCEPT_MIN_STRICT = 4;

export type RubricDimension =
  | "clarity"
  | "relevance"
  | "professional"
  | "engagement";

export type { Decision, JudgeFinding };

export interface RubricDimensionSpec {
  key: RubricDimension;
  /** Nome curto para UI e cabeçalho de CSV. */
  label: string;
  /** Pergunta operacional — é ela que vai no formulário humano. */
  question: string;
  /** Âncora verbal de cada ponto da escala 1–5. */
  anchors: Record<1 | 2 | 3 | 4 | 5, string>;
}

export const RUBRIC_DIMENSIONS: RubricDimensionSpec[] = [
  {
    key: "clarity",
    label: "Clareza e legibilidade",
    question:
      "O post é claro, compreensível, bem estruturado e fácil de ler?",
    anchors: {
      1: "Confuso. Bloco denso ou frases longas demais; não dá para identificar a ideia central.",
      2: "Difícil de acompanhar. Estrutura fraca, exige releitura; a ideia só aparece no fim (ou não aparece).",
      3: "Compreensível com esforço médio. Estrutura aceitável, mas há trechos densos, truncados ou repetitivos.",
      4: "Claro e bem organizado. Leitura fluida, ideia central evidente desde cedo, quebras de linha ajudam.",
      5: "Excepcionalmente claro. Cada parágrafo avança a ideia, o ritmo e a formatação servem o leitor, nada sobra.",
    },
  },
  {
    key: "relevance",
    label: "Relevância e valor informativo",
    question:
      "O post entrega informação significativa e substantiva, apropriada a um público profissional, e atende à intenção do tópico?",
    anchors: {
      1: "Sem valor ou fora do tema. Não informa nada e/ou não atende à intenção do tópico.",
      2: "Genérico. Senso comum e afirmações amplas sem substância; toca o tema de raspão.",
      3: "Informação correta, porém previsível. Cobre o básico do tópico sem acrescentar muito a quem já é da área.",
      4: "Substantivo. Traz dado, exemplo ou distinção útil e atende bem à intenção do tópico.",
      5: "Alto valor. Insight não óbvio, específico e acionável para o público profissional.",
    },
  },
  {
    key: "professional",
    label: "Adequação profissional",
    question:
      "O tom, a linguagem e a apresentação são apropriados para uma rede social profissional e para o público pretendido?",
    anchors: {
      1: "Inapropriado. Ofensivo, sensacionalista, informal a ponto de destoar, ou promocional agressivo.",
      2: "Destoa. Exageros, clickbait, jargão de marketing vazio, emojis ou pontuação em excesso.",
      3: "Aceitável. Nada impróprio, mas o registro oscila ou soa impessoal e genérico (\"texto de IA\").",
      4: "Apropriado. Tom profissional consistente e autêntico, linguagem adequada ao público.",
      5: "Exemplar. Voz profissional credível e natural, calibrada ao público, sem clichê.",
    },
  },
  {
    key: "engagement",
    label: "Qualidade do engajamento",
    question:
      "O post atrai atenção, sustenta o interesse e estimula interação profissional apropriada?",
    anchors: {
      1: "Não prende. Abertura sem gancho e nada que sustente a leitura; ou pede interação de forma artificial.",
      2: "Fraco. Começa devagar e o interesse cai no meio; convite genérico do tipo \"o que vocês acham?\".",
      3: "Mediano. Abertura funcional, mantém o leitor até o fim, convite presente mas pouco específico.",
      4: "Bom. Abertura que para o scroll, interesse sustentado, convite ancorado no conteúdo do post.",
      5: "Excelente. A primeira linha obriga a continuar, a tensão se mantém, e o convite ativa uma experiência específica do leitor.",
    },
  },
];

/** Escala compartilhada — rótulo de cada ponto, igual para todas as dimensões. */
export const SCALE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Aceitável",
  4: "Bom",
  5: "Excelente",
};

/** Nota holística, perguntada POR ÚLTIMO — ver `overall` em JudgeResult. */
export const OVERALL_QUESTION =
  "Considerando tudo, qual é a qualidade geral deste post?";

/**
 * Média ponderada das quatro dimensões. Ver DIMENSION_WEIGHTS.
 *
 * Soma em centésimos e divide UMA vez no fim: quatro multiplicações fracionárias
 * somadas acumulam resíduo, e este número decide ACCEPT/REJECT.
 */
export function composite(scores: Record<RubricDimension, number>): number {
  const bp = RUBRIC_DIMENSIONS.reduce(
    (acc, d) => acc + scores[d.key] * WEIGHT_BP[d.key],
    0,
  );
  return bp / 100;
}

/**
 * O piso: duas dimensões abaixo de ACCEPT_MIN, sendo ao menos uma delas de
 * conteúdo (clareza ou relevância).
 *
 * Existe porque a média perdoa buraco isolado por compensação — e um buraco em
 * clareza OU relevância acompanhado de qualquer outro não é compensável: o
 * texto ou não se entende ou não informa, e ainda tem um segundo defeito.
 */
export function floorViolated(
  scores: Record<RubricDimension, number>,
  min: number = ACCEPT_MIN,
): boolean {
  const below = RUBRIC_DIMENSIONS.filter((d) => scores[d.key] < min).map(
    (d) => d.key,
  );
  const temConteudo =
    below.includes("clarity") || below.includes("relevance");
  return temConteudo && below.length >= 2;
}

export interface DecisionOptions {
  /** Corte do composto. Default ACCEPT_COMPOSITE_MIN. */
  compositeMin?: number;
  /** Piso por dimensão. Default ACCEPT_MIN. */
  floorMin?: number;
}

/**
 * A regra de aceitação: ACCEPT ⟺ composto ≥ 3,5 E o piso não foi violado.
 *
 * Aplicada igual dos dois lados — à nota do juiz e à mediana dos humanos —, que
 * é o que torna a matriz de confusão do §9 uma comparação legítima. Os limiares
 * entram por parâmetro só para a análise de sensibilidade; o gate de produção
 * usa sempre os defaults.
 */
export function decide(
  scores: Record<RubricDimension, number>,
  opts: DecisionOptions = {},
): Decision {
  const compositeMin = opts.compositeMin ?? ACCEPT_COMPOSITE_MIN;
  const floorMin = opts.floorMin ?? ACCEPT_MIN;
  if (floorViolated(scores, floorMin)) return "REJECT";
  return composite(scores) >= compositeMin - EPSILON ? "ACCEPT" : "REJECT";
}

// ─── Coerência entre o diagnóstico e a nota ──────────────────────────────────
//
// O juiz escreve as issues ANTES de pontuar e marca, em cada uma, a dimensão a
// que ela pertence e o ponto da escala que ela descreve. A nota daquela dimensão
// não pode ser MAIOR que o pior ponto que ele mesmo citou.
//
// Isto não é rigor extra: é a régua que já existe, aplicada ao que ele acabou de
// escrever. Sem verificação em código o modelo não cumpre — medido em
// 2026-09-08: a mesma regra só como instrução no prompt moveu uma dimensão em
// cinco posts e não mudou nenhuma decisão.

export interface CoherenceViolation {
  dimension: RubricDimension;
  /** A nota que o juiz emitiu. */
  score: number;
  /** O pior ponto que ele citou nas issues daquela dimensão. */
  worstAnchor: number;
}

/** Dimensões em que a nota emitida é maior que o pior ponto citado nas issues. */
export function coherenceViolations(
  scores: Record<RubricDimension, number>,
  findings: JudgeFinding[],
): CoherenceViolation[] {
  const out: CoherenceViolation[] = [];
  for (const d of RUBRIC_DIMENSIONS) {
    const anchors = findings
      .filter((f) => f.dimension === d.key && typeof f.anchor === "number")
      .map((f) => f.anchor as number);
    if (!anchors.length) continue;
    const worstAnchor = Math.min(...anchors);
    if (scores[d.key] > worstAnchor) {
      out.push({ dimension: d.key, score: scores[d.key], worstAnchor });
    }
  }
  return out;
}

/** Mediana de notas ordinais (§7 do doc). Par → média dos dois centrais. */
export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// ─── Checagens determinísticas ───────────────────────────────────────────────
//
// Calculadas em código, NUNCA pedidas ao LLM: são fatos sobre o texto, e um
// modelo errando "tem URL?" polui uma variável que não deveria ter erro. Ficam
// fora da análise de alinhamento (o humano não as avalia) e servem ao Writer.

/** URL http(s) no corpo. Hashtags e menções não contam. */
export function hasExternalLinkInBody(text: string): boolean {
  return /https?:\/\/\S+/i.test(text);
}

/** Comprimento dentro da faixa do tamanho pedido. */
export function isLengthOk(text: string, postSize: PostSize): boolean {
  const range = POST_SIZE_RANGES[postSize];
  return text.length >= range.min && text.length <= range.max;
}

/**
 * O gate de CONFORMIDADE: o que devolve o draft ao writer sem passar pela nota.
 *
 * São as três checagens acima — faixa de caracteres, link no corpo e bait. Elas
 * já eram medidas e não faziam nada: um post de 1.202 chars num alvo de 500–900,
 * com bait, era aprovado porque as quatro dimensões estavam ok.
 *
 * Ficam FORA de `decide()` de propósito. A decisão é a variável do estudo e tem
 * que ser só a regra da rubrica, aplicável igual à mediana humana — o humano do
 * formulário não conta caracteres nem procura URL. Quem consome isto é o
 * roteamento do grafo (`routeAfterJudge`) e o prompt da reescrita.
 *
 * @returns lista de falhas em texto. Vazia = conforme.
 */
export function conformanceFailures(judgement: {
  lengthOk: boolean;
  hasExternalLinkInBody: boolean;
  hasEngagementBait: boolean;
}): string[] {
  const out: string[] = [];
  if (!judgement.lengthOk) out.push("fora da faixa de caracteres");
  if (judgement.hasExternalLinkInBody) out.push("link http no corpo");
  if (judgement.hasEngagementBait) out.push("engagement bait");
  return out;
}
