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


export interface JudgeResult {
  score: number; // 0–10 overall
  hookQuality: number; // 0–10
  originality: number; // 0–10
  scannability: number; // 0–10
  ctaQuality: number; // 0–10
  lengthAdequate: boolean;
  toneLinkedIn: boolean;
  hasEngagementBait: boolean;
  hasExternalLinkInBody: boolean;
  issues: string[];
  suggestions: string[];
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
