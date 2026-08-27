import { AgentStatus, JudgeResult, JudgeRunMeta, PostSize } from "../types/types";
import { SEED_CONDITION_SAMPLE, postLabel, seededShuffle } from "./blind";
import { ThreadSummary, listThreads } from "./threadStore";
import { normalizeTopic } from "./topic";

// ─── Seleção da amostra: DESENHO ANTERIOR (com judge × sem judge) ────────────
//
// ATENÇÃO: a unidade de análise do estudo mudou em 2026-08-26 para o par
// antes/depois dentro da mesma execução — ver `lib/revisionPairs.ts`, que é a
// fonte de verdade do desenho VIGENTE. Este módulo continua vivo porque a
// coleta já feita (e o `judge-repeat`, que a re-pontua) foi montada sobre ele;
// não construa análise nova em cima daqui.
//
// Este módulo é a ÚNICA fonte de verdade sobre quais execuções entram no estudo
// e com que rótulo cego (Post A, B, C…). Tanto o export (?format=csv|posts|
// mapping) quanto a página /estudo consomem daqui, então os três artefatos
// concordam por construção — antes cada um numerava por índice, e qualquer
// execução nova deslocava as letras, quebrando o cruzamento com o Google Forms.
//
// Regra (determinística, auditável — ver `excluded` no retorno):
//   1. Elegível: tem judgement, tem draft não-vazio e o status não é stopped/error.
//   2. Agrupa por (tópico normalizado × condição) e mantém a execução MAIS RECENTE
//      da célula — resolve as re-execuções do mesmo tópico sem escolha manual.
//   3. Só entram tópicos com AS DUAS condições (com_judge e sem_judge): o RQ2 é
//      pareado por tópico, então célula solta não serve pra nada.
//   4. Ordem embaralhada com seed fixa (não é com/sem alternado, que entregaria a
//      condição pro avaliador) e reprodutível entre chamadas.

export type StudyCondition = "com_judge" | "sem_judge";

export interface StudySample {
  post: string; // rótulo cego mostrado ao avaliador humano
  threadId: string;
  topic: string;
  topicKey: string;
  condition: StudyCondition;
  createdAt: string;
  status: AgentStatus;
  postSize: PostSize;
  judgeLoop: boolean;
  judgement: JudgeResult;
  judgeMeta: JudgeRunMeta | null;
  draft: string;
  revisionCount: number | null;
  judgeRetries: number | null;
}

export type ExclusionReason =
  | "sem_judgement"
  | "sem_draft"
  | "status_invalido"
  | "superseded"
  | "sem_par";

export interface ExcludedSample {
  threadId: string;
  topic: string;
  topicKey: string;
  condition: StudyCondition;
  createdAt: string;
  status: AgentStatus;
  reason: ExclusionReason;
  // Carregados quando existem: uma execução fora da amostra (tipicamente por
  // falta do par) ainda foi avaliada e o pesquisador precisa VÊ-LA na tela —
  // ficar fora do dataset pareado não é motivo para sumir da interface.
  judgement: JudgeResult | null;
  charCount: number;
}

export interface StudySelection {
  samples: StudySample[];
  excluded: ExcludedSample[];
  /** Tópicos pareados que compõem a amostra, na ordem canônica. */
  topics: { topicKey: string; topic: string; posts: string[] }[];
}

const INVALID_STATUSES: AgentStatus[] = ["stopped", "error"];

// normalizeTopic mora em ./topic (módulo folha) para o studyRecorder poder
// usá-la sem fechar o ciclo threadStore → studyRecorder → studySample →
// threadStore. Re-exportada aqui porque os exports e a /estudo já a importam
// deste módulo.
export { normalizeTopic };

function conditionOf(thread: ThreadSummary): StudyCondition {
  return thread.judgeLoop ? "com_judge" : "sem_judge";
}

export function selectStudySample(threads: ThreadSummary[]): StudySelection {
  const excluded: ExcludedSample[] = [];
  const push = (t: ThreadSummary, reason: ExclusionReason) =>
    excluded.push({
      threadId: t.threadId,
      topic: t.topic,
      topicKey: normalizeTopic(t.topic),
      condition: conditionOf(t),
      createdAt: t.createdAt,
      status: t.status,
      reason,
      judgement: t.judgement,
      charCount: t.draft?.length ?? 0,
    });

  // 1. Elegibilidade
  const eligible: ThreadSummary[] = [];
  for (const t of threads) {
    if (!t.judgement) push(t, "sem_judgement");
    else if (!t.draft || !t.draft.trim()) push(t, "sem_draft");
    else if (INVALID_STATUSES.includes(t.status)) push(t, "status_invalido");
    else eligible.push(t);
  }

  // 2. Uma execução por célula (tópico × condição): a mais recente vence.
  const cells = new Map<string, ThreadSummary>();
  for (const t of eligible) {
    const key = `${normalizeTopic(t.topic)}||${conditionOf(t)}`;
    const current = cells.get(key);
    if (!current) {
      cells.set(key, t);
      continue;
    }
    const [winner, loser] =
      t.createdAt > current.createdAt ? [t, current] : [current, t];
    cells.set(key, winner);
    push(loser, "superseded");
  }

  // 3. Só tópicos com as duas condições.
  const byTopic = new Map<
    string,
    Partial<Record<StudyCondition, ThreadSummary>>
  >();
  for (const t of cells.values()) {
    const key = normalizeTopic(t.topic);
    const entry = byTopic.get(key) ?? {};
    entry[conditionOf(t)] = t;
    byTopic.set(key, entry);
  }

  const pairedKeys: string[] = [];
  for (const [key, entry] of byTopic) {
    if (entry.com_judge && entry.sem_judge) pairedKeys.push(key);
    else {
      const orphan = entry.com_judge ?? entry.sem_judge;
      if (orphan) push(orphan, "sem_par");
    }
  }
  pairedKeys.sort();

  // 4. Ordem canônica → embaralha com seed fixa → atribui as letras.
  const ordered: ThreadSummary[] = [];
  for (const key of pairedKeys) {
    const entry = byTopic.get(key)!;
    ordered.push(entry.com_judge!, entry.sem_judge!);
  }
  const shuffled = seededShuffle(ordered, SEED_CONDITION_SAMPLE);

  const samples: StudySample[] = shuffled.map((t, i) => ({
    post: postLabel(i),
    threadId: t.threadId,
    topic: t.topic,
    topicKey: normalizeTopic(t.topic),
    condition: conditionOf(t),
    createdAt: t.createdAt,
    status: t.status,
    postSize: t.postSize,
    judgeLoop: t.judgeLoop,
    judgement: t.judgement!,
    judgeMeta: t.judgeMeta ?? null,
    draft: t.draft!,
    revisionCount: t.revisionCount,
    judgeRetries: t.judgeRetries,
  }));

  const byPost = new Map(samples.map((s) => [s.threadId, s.post]));
  const topics = pairedKeys.map((key) => {
    const entry = byTopic.get(key)!;
    return {
      topicKey: key,
      topic: entry.com_judge!.topic,
      posts: [
        byPost.get(entry.com_judge!.threadId)!,
        byPost.get(entry.sem_judge!.threadId)!,
      ].sort(),
    };
  });

  return { samples, excluded, topics };
}

/** Atalho: lê o threadStore e devolve a seleção pronta. */
export async function getStudySelection(): Promise<StudySelection> {
  return selectStudySample(await listThreads());
}
