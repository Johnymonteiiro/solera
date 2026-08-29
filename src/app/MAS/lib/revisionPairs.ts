import { MAX_JUDGE_RETRIES } from "../constants";
import { AgentStatus, JudgeResult, JudgeRunMeta } from "../types/types";
import {
  SEED_REVISION_PAIRS,
  mulberry32,
  postLabel,
  seedFrom,
  seededShuffle,
} from "./blind";
import {
  DraftTrigger,
  RunMetaRecord,
  VersionRecord,
  getAllVersionHistories,
  listRunMeta,
} from "./studyRecorder";

// ─── Desenho antes/depois: a revisão do judge melhorou o post? ───────────────
//
// Fonte de verdade da unidade de análise ATUAL. A unidade não é mais "execução
// com judge × execução sem judge" (ver studySample.ts, desenho anterior): é o
// PAR de versões consecutivas DENTRO da mesma execução — o draft que o judge
// reprovou contra a reescrita que a crítica dele provocou.
//
// Por que é melhor: com/sem judge eram execuções separadas — pesquisa
// diferente, insights diferentes, draft do zero — então a variância entre
// execuções ficava confundida com o efeito do judge. No par antes/depois tudo
// é compartilhado; só a crítica muda.
//
// TRÊS RESSALVAS que este módulo carrega de propósito, em vez de esconder:
//
//   1. SELEÇÃO EM VARIÁVEL PÓS-TRATAMENTO. Filtrar "só os que revisaram"
//      responde "quando o judge intervém, ajuda?", NÃO "o loop melhora a
//      qualidade" — os aprovados de primeira são justamente os casos de efeito
//      zero. Por isso `runs` devolve TODAS as execuções e `stats.firstPassRate`
//      é calculado: a taxa de aprovação de primeira tem que ser reportada junto
//      com qualquer efeito medido nos pares.
//
//   2. O DELTA DO PRÓPRIO JUDGE NÃO É EVIDÊNCIA. Judge e Writer são o mesmo
//      modelo, e a v2 foi escrita PARA agradar este judge — ele vai pontuá-la
//      acima quase por construção (Goodhart). `deltaScore` existe como
//      descritivo e para detectar os casos onde nem isso aconteceu; quem mede
//      alguma coisa é o delta HUMANO, que vem do form.
//
//   3. PARES ANINHADOS NÃO SÃO INDEPENDENTES. 3 pares de uma execução não são
//      n=3. Todo par carrega `threadId` para a análise agregar por execução (ou
//      usar modelo misto) em vez de tratar como pseudo-replicação.
//
// Execuções que ESTOURARAM MAX_JUDGE_RETRIES são as mais limpas (`exhausted`):
// o judge nunca aprovou, então a versão final não sofreu a seleção "revisado
// até o juiz aceitar".

export type PairExclusion =
  | "sem_nota_no_antes"
  | "sem_nota_no_depois"
  | "revisao_humana"
  | "sem_loop_do_judge"
  | "run_descartado";

/** Por que um par VÁLIDO mesmo assim não foi para o form humano. */
export type SampleExclusion =
  | "par_intermediario"
  | "topico_repetido"
  | "acima_do_teto";

/**
 * "loop"        → v1 × última versão do loop do judge. É a unidade do ESTUDO:
 *                 responde "a revisão do agente melhorou o post?".
 * "consecutive" → v(n) × v(n+1). Isola UMA crítica; serve para o mecanismo
 *                 (ver o judge empacar), não vai ao form.
 */
export type PairKind = "loop" | "consecutive";

// Teto do form humano. Cada par ocupa DOIS posts (o antes e o depois entram
// separados e cegos), então 8 posts = 4 pares. Calibrado pelo tempo de resposta:
// o form anterior tinha 6 posts e levava ~10 min; acima de ~20 min o abandono no
// meio vira o risco dominante, e um avaliador que para na metade não rende par
// nenhum — ele some das DUAS pontas do delta.
export const FORM_MAX_POSTS = 8;
export const MAX_SAMPLE_PAIRS = FORM_MAX_POSTS / 2;

export interface PairVersion {
  id: string;
  version: number;
  /** Rótulo cego mostrado ao avaliador humano. null = fora da amostra do form. */
  label: string | null;
  content: string;
  charCount: number;
  trigger: DraftTrigger;
  createdAt: string;
  judgement: JudgeResult | null;
  judgeMeta: JudgeRunMeta | null;
}

export interface RevisionPair {
  /** `${threadId}#v1-v2` — estável entre chamadas, serve de chave no CSV. */
  pairId: string;
  kind: PairKind;
  threadId: string;
  topic: string;
  topicKey: string;
  status: AgentStatus;
  judgeLoop: boolean;
  createdAt: string;
  /** Por que a reescrita aconteceu — é o trigger da versão "depois". */
  cause: DraftTrigger;
  before: PairVersion;
  after: PairVersion;
  /** Nota do judge: depois − antes. DESCRITIVO, não evidência (ressalva 2). */
  deltaScore: number | null;
  deltaChars: number;
  /** A execução estourou MAX_JUDGE_RETRIES (o judge nunca aprovou). */
  exhausted: boolean;
  /** Par válido: reescrita do judge com nota nas duas pontas. Entra no dataset. */
  eligible: boolean;
  excludeReason: PairExclusion | null;
  /** Par que vai ao form humano (e por isso tem rótulo cego nas duas versões). */
  inSample: boolean;
  /** Preenchido só quando eligible && !inSample. */
  sampleExclusion: SampleExclusion | null;
}

export type RunOutcome =
  | "descartado"
  | "first_pass"
  | "revised"
  | "historico_incompleto"
  | "interrompido"
  | "sem_nota"
  | "sem_draft"
  | "fora_do_desenho";

export interface RunOverview {
  threadId: string;
  topic: string;
  topicKey: string;
  status: AgentStatus;
  judgeLoop: boolean;
  createdAt: string;
  versions: number;
  judgeRetries: number;
  revisionCount: number;
  firstScore: number | null;
  finalScore: number | null;
  exhausted: boolean;
  outcome: RunOutcome;
  /** Descartada do estudo por decisão do pesquisador (segue no banco). */
  excludedAt: string | null;
  excludedReason: string | null;
}

export interface RevisionStats {
  runs: number;
  /** Execuções com judgeLoop=false — o judge não reescreve, não há par. */
  runsForaDoDesenho: number;
  /** Execuções descartadas do estudo por decisão do pesquisador. */
  runsDescartados: number;
  /** Denominador honesto da taxa: execuções em que o gate do judge decidiu algo. */
  runsAvaliados: number;
  firstPass: number;
  revised: number;
  /** first_pass ÷ (first_pass + revised). Ressalva 1 — reportar SEMPRE. */
  firstPassRate: number | null;
  exhaustedRuns: number;
  /** Execuções cujo histórico de versões não foi capturado (coleta pré-migração). */
  historicoIncompleto: number;
  pairs: number;
  pairsElegiveis: number;
  pairsHumanos: number;
  /** Pares "loop" (um por execução com reescrita do judge) — candidatos ao form. */
  pairsLoop: number;
  /** Pares que vão ao form: 1 por execução, 1 por tópico, até MAX_SAMPLE_PAIRS. */
  pairsNaAmostra: number;
  /** Execuções que teriam par mas ficaram fora da amostra (dedupe ou teto). */
  paresForaDaAmostra: number;
  versoesRotuladas: number;
  /** Teto vigente do form, para a tela não repetir a constante. */
  formMaxPosts: number;
  /** Média do deltaScore nos pares elegíveis. Descritivo (ressalva 2). */
  deltaJudgeMedio: number | null;
}

export interface RevisionSelection {
  pairs: RevisionPair[];
  runs: RunOverview[];
  stats: RevisionStats;
}

function toPairVersion(v: VersionRecord, label: string | null): PairVersion {
  return {
    id: v.id,
    version: v.version,
    label,
    content: v.content,
    charCount: v.charCount,
    trigger: v.trigger,
    createdAt: v.createdAt,
    judgement: v.judgement,
    judgeMeta: v.judgeMeta,
  };
}

function exclusionFor(
  before: VersionRecord,
  after: VersionRecord,
  run: RunMetaRecord,
): PairExclusion | null {
  // Descarte explícito vence tudo: a execução continua no banco e nos exports,
  // mas nenhum par dela entra na análise.
  if (run.excludedAt) return "run_descartado";
  const judgeLoop = run.judgeLoop;
  // judgeLoop=false não deveria produzir par nenhum (o grafo vai direto pro
  // HITL). Se produziu, a reescrita veio de outro lugar — não é o tratamento
  // que este desenho mede.
  if (!judgeLoop) return "sem_loop_do_judge";
  // Revisão humana é OUTRO tratamento. Fica registrada e visível, mas fora do
  // dataset do judge — misturar as duas responderia uma pergunta que ninguém fez.
  if (after.trigger === "human_revision") return "revisao_humana";
  if (!before.judgement) return "sem_nota_no_antes";
  if (!after.judgement) return "sem_nota_no_depois";
  return null;
}

function outcomeFor(
  run: RunMetaRecord,
  versions: VersionRecord[],
  firstScore: number | null,
): RunOutcome {
  if (run.excludedAt) return "descartado";
  if (!run.judgeLoop) return "fora_do_desenho";
  if (versions.length === 0) return "sem_draft";
  if (!versions.some((v) => v.judgement)) return "sem_nota";
  if (versions.length > 1) return "revised";
  // Uma versão só, mas o contador diz que houve reescrita: o histórico NÃO foi
  // capturado. É o caso das execuções migradas do threads.json, onde só o draft
  // FINAL sobreviveu e entrou como v1 — chamar isso de "aprovado de primeira"
  // inverteria o significado do dado e inflaria a taxa com execuções que na
  // verdade foram reprovadas várias vezes.
  if (run.judgeRetries > 0) return "historico_incompleto";
  // Uma versão só e nenhuma reescrita: aprovada de primeira apenas se passou do
  // gate. Abaixo do gate significa que a execução parou antes de o writer
  // reescrever — não é aprovação.
  return firstScore != null && firstScore >= 7 ? "first_pass" : "interrompido";
}

export function selectRevisionPairs(
  runs: RunMetaRecord[],
  histories: Map<string, VersionRecord[]>,
): RevisionSelection {
  const overviews: RunOverview[] = [];
  // Os pares nascem carregando os VersionRecord crus porque os rótulos cegos só
  // podem ser atribuídos depois de conhecer TODOS os pares elegíveis.
  type PendingPair = Omit<RevisionPair, "before" | "after"> & {
    beforeRec: VersionRecord;
    afterRec: VersionRecord;
  };
  const pending: PendingPair[] = [];

  for (const run of runs) {
    const versions = histories.get(run.threadId) ?? [];
    const firstScore = versions[0]?.judgement?.score ?? null;
    const lastJudged = [...versions].reverse().find((v) => v.judgement);
    // Segmento PURO do loop do judge: da v1 até a última reescrita dele, antes
    // de qualquer revisão humana. Depois que o humano entra, o texto deixa de
    // ser produto só da crítica do judge — e a última versão de um run pode ser
    // humana (foi o caso do thread_1d8e23eb: v5 e v6 eram revisão humana).
    const primeiraHumana = versions.findIndex((v) => v.trigger === "human_revision");
    const loopSegment = primeiraHumana === -1 ? versions : versions.slice(0, primeiraHumana);
    const retriesDoJudge = loopSegment.filter((v) => v.trigger === "judge_retry").length;

    // Derivado das VERSÕES, não de run.judgeRetries: aquele contador incrementa
    // também nas passadas de revisão humana (writer.node.ts:41 trata "já existe
    // nota" como judge retry), então 1 reescrita do judge + 2 revisões humanas
    // marcariam "esgotou o judge" sem ter esgotado.
    const exhausted = run.judgeLoop && retriesDoJudge >= MAX_JUDGE_RETRIES;

    overviews.push({
      threadId: run.threadId,
      topic: run.topic,
      topicKey: run.topicNorm,
      status: run.status,
      judgeLoop: run.judgeLoop,
      createdAt: run.createdAt,
      versions: versions.length,
      judgeRetries: run.judgeRetries,
      revisionCount: run.revisionCount,
      firstScore,
      finalScore: lastJudged?.judgement?.score ?? null,
      exhausted,
      outcome: outcomeFor(run, versions, firstScore),
      excludedAt: run.excludedAt,
      excludedReason: run.excludedReason,
    });

    // ── O par do ESTUDO: v1 × última versão do loop do judge ──────────────
    //
    // A pergunta é "a revisão do agente melhorou o post?", e quem responde isso
    // é o antes/depois do LOOP INTEIRO — não uma crítica isolada. Ninguém
    // entrega a v2: entrega a última versão que o loop produziu. Num run com 3
    // reescritas, este par é v1→v4.
    //
    // É também o contraste com mais chance de aparecer no delta humano, que é a
    // restrição real do estudo: os deltas consecutivos medidos até aqui foram
    // 0, +1, −1, +2, 0, 0 — pequenos demais para uma amostra deste tamanho.
    if (retriesDoJudge > 0) {
      const before = loopSegment[0];
      const after = loopSegment[loopSegment.length - 1];
      const excludeReason = exclusionFor(before, after, run);
      pending.push({
        pairId: `${run.threadId}#v${before.version}-v${after.version}`,
        kind: "loop",
        threadId: run.threadId,
        topic: run.topic,
        topicKey: run.topicNorm,
        status: run.status,
        judgeLoop: run.judgeLoop,
        createdAt: run.createdAt,
        cause: "judge_retry",
        deltaScore:
          before.judgement && after.judgement
            ? after.judgement.score - before.judgement.score
            : null,
        deltaChars: after.charCount - before.charCount,
        exhausted,
        eligible: excludeReason === null,
        excludeReason,
        inSample: false,
        sampleExclusion: null,
        beforeRec: before,
        afterRec: after,
      });
    }

    // Pares de versões CONSECUTIVAS: cada um isola UMA crítica do judge. Não vão
    // ao form (o humano avaliaria seis textos quase idênticos), mas ficam no
    // dataset e nos exports — são eles que mostram a nota do judge empacando
    // reescrita após reescrita, que é achado por si só.
    for (let i = 0; i < versions.length - 1; i++) {
      const before = versions[i];
      const after = versions[i + 1];
      const excludeReason = exclusionFor(before, after, run);
      pending.push({
        pairId: `${run.threadId}#v${before.version}-v${after.version}#seq`,
        kind: "consecutive",
        threadId: run.threadId,
        topic: run.topic,
        topicKey: run.topicNorm,
        status: run.status,
        judgeLoop: run.judgeLoop,
        createdAt: run.createdAt,
        cause: after.trigger,
        deltaScore:
          before.judgement && after.judgement
            ? after.judgement.score - before.judgement.score
            : null,
        deltaChars: after.charCount - before.charCount,
        exhausted,
        eligible: excludeReason === null,
        excludeReason,
        // Definidos no passo da amostra, abaixo — dependem de conhecer todos os
        // pares de todas as execuções.
        inSample: false,
        sampleExclusion: null,
        beforeRec: before,
        afterRec: after,
      });
    }
  }

  // ── Amostra do form humano ──────────────────────────────────────────────
  //
  // Regra determinística e auditável — `sampleExclusion` registra o que caiu e
  // por quê. Um par estar FORA da amostra não o tira do dataset nem dos exports:
  // só quer dizer que nenhum humano vai pontuá-lo.
  //
  //   1. UM par por execução: o PRIMEIRO (v1→v2). É a primeira intervenção do
  //      judge — toda execução revisada tem uma, é a mesma "dose" em todas, e
  //      não seleciona pelo resultado. Pegar o de maior delta seria cherry-pick;
  //      pegar o último mediria um "antes" que já é fruto de N críticas
  //      anteriores. É o que faz n = execuções e resolve a ressalva 3.
  //
  //   2. UM par por tópico normalizado. Duas execuções do mesmo tópico poriam
  //      quatro textos quase idênticos no mesmo form — o avaliador percebe que é
  //      o mesmo post revisado e para de avaliar às cegas.
  //
  //   3. Teto de MAX_SAMPLE_PAIRS pares, priorizando execuções `exhausted` (o
  //      judge nunca aprovou, então a versão final não passou pela seleção
  //      "revisado até o juiz aceitar") e, dentro disso, as MAIS ANTIGAS.
  //
  // Antigas primeiro, não recentes, porque a amostra precisa ser ESTÁVEL: rodar
  // uma execução nova não pode remapear as letras de um form que já foi a campo.
  // Com FIFO a amostra só cresce por acréscimo até encher. A exceção é uma
  // execução `exhausted` nova com o teto já cheio — ela desloca uma
  // não-exhausted; se o form já estiver rodando, reexporte o mapping antes de
  // cruzar as respostas.

  // Candidato de cada execução = o par "loop" (v1 × última do loop do judge).
  // Há no máximo um por execução, então "um par por execução" cai fora de graça
  // — e é ele que responde a pergunta do estudo. Os consecutivos ficam no
  // dataset como material de mecanismo.
  const primary = new Map<string, PendingPair>();
  for (const p of pending) {
    if (!p.eligible || p.kind !== "loop") continue;
    primary.set(p.threadId, p);
  }

  // Desempate por threadId em toda comparação: dois runs podem compartilhar
  // createdAt (mesmo segundo) e a amostra não pode depender da ordem do banco.
  const older = (a: PendingPair, b: PendingPair) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? a : b;
    return a.threadId < b.threadId ? a : b;
  };

  const byTopic = new Map<string, PendingPair>();
  for (const p of primary.values()) {
    const cur = byTopic.get(p.topicKey);
    byTopic.set(p.topicKey, cur ? older(p, cur) : p);
  }

  const ranked = [...byTopic.values()].sort((a, b) => {
    if (a.exhausted !== b.exhausted) return a.exhausted ? -1 : 1;
    return older(a, b) === a ? -1 : 1;
  });
  const chosen = new Map(
    ranked.slice(0, MAX_SAMPLE_PAIRS).map((p) => [p.pairId, p] as const),
  );

  for (const p of pending) {
    if (!p.eligible) continue;
    if (chosen.has(p.pairId)) {
      p.inSample = true;
    } else if (p.kind === "consecutive") {
      p.sampleExclusion = "par_intermediario";
    } else if (byTopic.get(p.topicKey)?.pairId !== p.pairId) {
      p.sampleExclusion = "topico_repetido";
    } else {
      p.sampleExclusion = "acima_do_teto";
    }
  }

  // Rótulos cegos: só as versões da AMOSTRA. Rotular o dataset inteiro daria
  // letras a textos que ninguém vai avaliar.
  //
  // ATRIBUIÇÃO POR ACRÉSCIMO, e isto é o ponto: cada par da fila FIFO recebe um
  // bloco fixo de duas letras (par 0 → A,B; par 1 → C,D; …). Uma execução nova
  // entra no fim e só ACRESCENTA letras — as já distribuídas não se movem, então
  // um form que já foi a campo continua casando com o mapping. A versão anterior
  // embaralhava a lista inteira e remapeava TUDO a cada par novo: as respostas
  // coletadas passariam a apontar para o post errado, sem erro nenhum aparecer.
  //
  // Qual das duas versões fica com a letra menor sai de um sorteio determinístico
  // por pairId — sem isso, "letra ímpar = antes" entregaria a direção da revisão.
  //
  // Resíduo assumido: duas letras consecutivas pertencem ao mesmo par. Só vaza
  // para quem conhece a regra, e os dois textos serem quase idênticos já é um
  // indício muito maior. Se um dia isso incomodar, o caminho é congelar a amostra
  // no banco (uma coluna de rótulo em draft_versions), não voltar a embaralhar.
  const labelById = new Map<string, string>();
  ranked.slice(0, MAX_SAMPLE_PAIRS).forEach((p, i) => {
    const primeiroEhAntes =
      mulberry32(SEED_REVISION_PAIRS ^ seedFrom(p.pairId))() < 0.5;
    const [primeiro, segundo] = primeiroEhAntes
      ? [p.beforeRec, p.afterRec]
      : [p.afterRec, p.beforeRec];
    labelById.set(primeiro.id, postLabel(2 * i));
    labelById.set(segundo.id, postLabel(2 * i + 1));
  });

  const pairs: RevisionPair[] = pending.map(({ beforeRec, afterRec, ...rest }) => ({
    ...rest,
    before: toPairVersion(beforeRec, labelById.get(beforeRec.id) ?? null),
    after: toPairVersion(afterRec, labelById.get(afterRec.id) ?? null),
  }));

  const eligible = pairs.filter((p) => p.eligible);
  // Δ médio descreve o par do ESTUDO (loop inteiro). Misturar os consecutivos
  // aqui diluiria o efeito em N críticas e não corresponde a nada reportável.
  const deltas = eligible
    .filter((p) => p.kind === "loop")
    .map((p) => p.deltaScore)
    .filter((d): d is number => d != null);
  const firstPass = overviews.filter((r) => r.outcome === "first_pass").length;
  const revised = overviews.filter((r) => r.outcome === "revised").length;
  const avaliados = firstPass + revised;

  const stats: RevisionStats = {
    runs: overviews.length,
    runsForaDoDesenho: overviews.filter((r) => !r.excludedAt && !r.judgeLoop).length,
    runsDescartados: overviews.filter((r) => r.outcome === "descartado").length,
    runsAvaliados: avaliados,
    firstPass,
    revised,
    firstPassRate: avaliados ? firstPass / avaliados : null,
    exhaustedRuns: overviews.filter((r) => r.exhausted).length,
    historicoIncompleto: overviews.filter(
      (r) => r.outcome === "historico_incompleto",
    ).length,
    pairs: pairs.length,
    pairsElegiveis: eligible.length,
    pairsHumanos: pairs.filter((p) => p.excludeReason === "revisao_humana").length,
    pairsLoop: pairs.filter((p) => p.kind === "loop" && p.eligible).length,
    pairsNaAmostra: chosen.size,
    paresForaDaAmostra: primary.size - chosen.size,
    versoesRotuladas: labelById.size,
    formMaxPosts: FORM_MAX_POSTS,
    deltaJudgeMedio: deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length
      : null,
  };

  return { pairs, runs: overviews, stats };
}

/**
 * Ordem em que os posts aparecem no form: embaralhada com seed fixa.
 *
 * Separada da atribuição de letras de propósito — a ORDEM pode mudar sem
 * quebrar nada (o cruzamento é por rótulo), e é ela que evita as duas versões
 * de um par caírem lado a lado na tela do avaliador.
 */
export function formOrder(pairs: RevisionPair[]): PairVersion[] {
  const versions = pairs
    .filter((p) => p.inSample)
    .flatMap((p) => [p.before, p.after])
    .filter((v) => v.label);
  return seededShuffle(versions, SEED_REVISION_PAIRS);
}

/**
 * Atalho: lê o banco (duas queries) e devolve a seleção pronta.
 *
 * Escopada por dono, como a amostra do studySample: as duas queries têm que
 * concordar sobre o conjunto de execuções, senão `getAllVersionHistories`
 * traria versões de runs que `listRunMeta` não listou.
 */
export async function getRevisionSelection(
  ownerId: string,
): Promise<RevisionSelection> {
  const [runs, histories] = await Promise.all([
    listRunMeta(ownerId),
    getAllVersionHistories(ownerId),
  ]);
  return selectRevisionPairs(runs, histories);
}
