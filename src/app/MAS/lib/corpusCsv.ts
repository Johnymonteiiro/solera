import { CorpusItem } from "./studyCorpus";

// Colunas e linhas do export do corpus, num lugar só.
//
// A rota (`/api/mas/export/corpus`) e o script de linha de comando
// (`pnpm study:corpus-csv`) montam o MESMO arquivo. Duas cópias da lista de
// colunas divergiriam no primeiro campo novo, e a divergência apareceria como
// coluna faltando no meio da análise — não como erro de compilação.
//
// A ordem das colunas é parte do contrato: `study/analysis/gate_study.py` lê
// por nome, mas quem abre no Excel lê por posição.

export interface SheetColumnSpec {
  header: string;
  key: string;
  width?: number;
}

export const CORPUS_ITEM_COLUMNS: SheetColumnSpec[] = [
  { header: "post", key: "post" },
  { header: "inCorpus", key: "inCorpus" },
  { header: "exclusion", key: "exclusion", width: 18 },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "versionId", key: "versionId", width: 38 },
  { header: "version", key: "version" },
  { header: "topic", key: "topic", width: 32 },
  { header: "topicKey", key: "topicKey", width: 32 },
  { header: "status", key: "status", width: 14 },
  { header: "createdAt", key: "createdAt", width: 22 },
  { header: "writerModel", key: "writerModel", width: 16 },
  { header: "decision", key: "decision", width: 10 },
  { header: "clarity", key: "clarity" },
  { header: "relevance", key: "relevance" },
  { header: "professional", key: "professional" },
  { header: "engagement", key: "engagement" },
  { header: "overall", key: "overall" },
  { header: "lengthOk", key: "lengthOk" },
  { header: "hasEngagementBait", key: "hasEngagementBait" },
  { header: "hasExternalLinkInBody", key: "hasExternalLinkInBody" },
  { header: "charCount", key: "charCount" },
  { header: "judgeModel", key: "judgeModel", width: 16 },
  { header: "judgeTemperature", key: "judgeTemperature" },
  { header: "rubricVersion", key: "rubricVersion", width: 10 },
  { header: "rubricHash", key: "rubricHash", width: 18 },
  { header: "judgedAt", key: "judgedAt", width: 22 },
  { header: "conteudo", key: "conteudo", width: 60 },
];

export const CORPUS_MAPPING_COLUMNS: SheetColumnSpec[] = [
  { header: "post", key: "post" },
  { header: "versionId", key: "versionId", width: 38 },
  { header: "threadId", key: "threadId", width: 38 },
  { header: "version", key: "version" },
  { header: "topic", key: "topic", width: 32 },
  { header: "writerModel", key: "writerModel", width: 16 },
  { header: "decision", key: "decision", width: 10 },
];

/** 1 linha por CANDIDATO — inclui os excluídos, com o motivo. É o registro auditável. */
export function corpusItemRow(i: CorpusItem): Record<string, unknown> {
  const j = i.judgement;
  return {
    post: i.label ?? "",
    inCorpus: i.inCorpus,
    exclusion: i.exclusion ?? "",
    threadId: i.threadId,
    versionId: i.versionId,
    version: i.version,
    topic: i.topic,
    topicKey: i.topicKey,
    status: i.status,
    createdAt: i.createdAt,
    writerModel: i.writerModel,
    decision: j?.decision ?? "",
    clarity: j?.clarity ?? "",
    relevance: j?.relevance ?? "",
    professional: j?.professional ?? "",
    engagement: j?.engagement ?? "",
    overall: j?.overall ?? "",
    lengthOk: j?.lengthOk ?? "",
    hasEngagementBait: j?.hasEngagementBait ?? "",
    hasExternalLinkInBody: j?.hasExternalLinkInBody ?? "",
    charCount: i.charCount,
    judgeModel: i.judgeMeta?.model ?? "",
    judgeTemperature: i.judgeMeta?.temperature ?? "",
    rubricVersion: i.judgeMeta?.rubricVersion ?? "",
    rubricHash: i.judgeMeta?.rubricHash ?? "",
    judgedAt: i.judgeMeta?.judgedAt ?? "",
    conteudo: i.content,
  };
}

/** Só o corpus: a chave que reencontra a versão atrás de cada letra. */
export function corpusMappingRow(i: CorpusItem): Record<string, unknown> {
  return {
    post: i.label ?? "",
    versionId: i.versionId,
    threadId: i.threadId,
    version: i.version,
    topic: i.topic,
    writerModel: i.writerModel,
    decision: i.judgement?.decision ?? "",
  };
}
