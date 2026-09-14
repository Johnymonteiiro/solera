// Navigation types

export type NavigatorProvider = "tavily" | "brave";
export type SearchLanguage = "pt-BR" | "en-US";
export type PostSize = "small" | "medium" | "large";

export interface NavigatorOptions {
  query?: string;
  apiKey?: string;
  maxResults?: number;
  language?: SearchLanguage;
}

export interface ResearchResult {
  url: string;
  title: string;
  content: string; // conteúdo completo da página, se disponível
  relevanceScore: number; // pontuação de relevância da página para a consulta, por exemplo, de 0 a 1
}


/** Decisão do gate de qualidade. Ver `decide()` em lib/rubric.ts. */
export type Decision = "ACCEPT" | "REJECT";

/** As quatro dimensões do instrumento. As âncoras vivem em lib/rubric.ts. */
export type RubricDimensionKey =
  | "clarity"
  | "relevance"
  | "professional"
  | "engagement";

/**
 * Uma issue do juiz, ancorada na escala.
 *
 * O juiz declara a que dimensão o problema pertence e que ponto da escala aquele
 * problema descreve — é o que permite verificar em código se a nota emitida
 * contradiz o próprio diagnóstico. `format` cobre tamanho e link, que o prompt
 * trata como contexto e não como dimensão.
 */
export interface JudgeFinding {
  dimension: RubricDimensionKey | "format";
  /** Ponto da escala que esta issue descreve. null quando dimension="format". */
  anchor: number | null;
  text: string;
}

/**
 * Avaliação do Judge na rubrica v2 — ver `lib/rubric.ts`, que é a fonte única
 * das dimensões, das âncoras e da regra de aceitação.
 *
 * As quatro primeiras são o INSTRUMENTO COMPARÁVEL: o formulário humano
 * pergunta exatamente estas quatro, com as mesmas âncoras, na mesma escala 1–5.
 * O resto é diagnóstico para o Writer e não entra na análise de alinhamento.
 */
export interface JudgeResult {
  clarity: number; // 1–5 — Clareza e legibilidade
  relevance: number; // 1–5 — Relevância e valor informativo
  professional: number; // 1–5 — Adequação profissional
  engagement: number; // 1–5 — Qualidade do engajamento
  /** Holística 1–5, eliciada POR ÚLTIMO. 0 = ainda não avaliado (sentinela). */
  overall: number;
  /** Calculada em código pela regra pré-registrada, não eliciada do LLM. */
  decision: Decision;

  // ── Fora da análise de alinhamento ──────────────────────────────────────
  /** Eliciada do LLM: não é determinístico decidir o que é bait. */
  hasEngagementBait: boolean;
  /** Calculada em código (regex de URL). */
  hasExternalLinkInBody: boolean;
  /** Calculada em código (faixa de chars do postSize). */
  lengthOk: boolean;
  issues: string[];
  suggestions: string[];

  /**
   * As issues com a dimensão e o ponto da escala que cada uma descreve.
   *
   * `issues` (string[]) segue sendo derivada daqui — é o que writer, UI, CSV e
   * as linhas já gravadas consomem. Opcional porque as avaliações anteriores a
   * 2026-09-08 não têm a marcação. Ver JudgeFinding em lib/rubric.ts.
   */
  findings?: JudgeFinding[];
  /**
   * O juiz emitiu nota acima do ponto que ele mesmo citou, insistiu na
   * retentativa, e o código baixou a nota. É medida da confiabilidade do juiz,
   * não detalhe de implementação — ver coherenceViolations().
   */
  coherenceClamped?: boolean;
}

/**
 * Uma versão do draft, sem o texto — para a UI contar o loop.
 *
 * O contador `judgeRetries` do state NÃO responde "houve loop?": ele incrementa
 * também nas passadas de revisão humana (writer.node trata "já existe nota"
 * como retry). Quem sabe quantas reescritas o judge pediu é o histórico de
 * versões no banco, pelo `trigger` de cada uma. Esta é a forma enxuta dele.
 */
export interface DraftVersionSummary {
  version: number;
  trigger: "initial" | "judge_retry" | "human_revision";
  charCount: number;
  /** Holística da versão. null = versão sem nota (o judge não chegou a rodar). */
  overall: number | null;
  decision: Decision | null;
}

// Procedência de uma avaliação do Judge. Sem isto, uma nota no dataset é
// irreproduzível: o rubric efetivo depende de `agent-config.json` (mutável em
// runtime pela tela /agentes) e o modelo vem de env var. `rubricHash` cobre os
// dois — muda se alguém editar o prompt do código OU a config.
export interface JudgeRunMeta {
  model: string;
  temperature: number;
  /** sha256 (16 hex) de role + promptOverride + template do rubric. */
  rubricHash: string;
  /**
   * Versão do INSTRUMENTO ("v1" | "v2"). O hash detecta qualquer mudança, mas
   * não diz qual desenho a nota serve — e a análise precisa separar as coletas
   * por isso, não por 16 hex opacos.
   */
  rubricVersion: string;
  judgedAt: string; // ISO 8601
}

export type HumanDecision = "approve" | "reject" | "restart_research" | "stop";

export interface HumanFeedback {
  decision: HumanDecision;
  comments?: string;
  timestamp: string; // ISO 8601
}

// status 

export type AgentStatus =
  | "idle"
  | "researching"
  | "analyzing"
  | "writing"
  | "judging"
  | "awaiting_review"
  | "revising"
  | "publishing"
  | "done"
  | "stopped"
  | "error";

  
// ─── Payloads SSE ─────────────────────────────────────────────────────────────
export type StoppedReason =
  | "no_research_results"
  | "user_cancel"
  | "max_judge_retries";

export interface StatusEvent {
  type: AgentStatus;
  threadId: string;
  payload?: {
    draft?: string;
    judgement?: JudgeResult;
    judgeMeta?: JudgeRunMeta;
    insights?: string[];
    researchResults?: ResearchResult[];
    revisionCount?: number;
    judgeRetries?: number;
    stuck?: boolean;
    stoppedReason?: StoppedReason;
    finalPostUrl?: string;
    error?: string;
  };
}

// ─── API request / response ───────────────────────────────────────────────────
export interface RunRequest {
  topic: string;
  /** Condição do corpus: modelo do writer nesta execução. */
  writerModel?: string;
  navigatorProvider?: NavigatorProvider;
  language?: SearchLanguage;
  postSize?: PostSize;
}

export interface RunResponse {
  threadId: string;
}

export interface ReviewRequest {
  threadId: string;
  decision: "approve" | "reject";
  comments?: string;
}

export interface ReviewResponse {
  ok: boolean;
}

export interface ResultResponse {
  finalPostUrl: string | null;
  status: AgentStatus;
  draft?: string;
}

// ─── Persistência de posts publicados ─────────────────────────────────────────
export interface PublishedPost {
  threadId: string;
  topic: string;
  draft: string;
  finalPostUrl: string;
  language: SearchLanguage;
  postSize: PostSize;
  publishedAt: string; // ISO 8601
}
