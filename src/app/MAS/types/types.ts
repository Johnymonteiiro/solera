// Navigation types

export type NavigatorProvider = "tavily" | "brave";
export type SearchLanguage = "pt-BR" | "en-US";

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


export interface CritiqueResult {
  score: number; // 0–10 overall
  hookQuality: number; // 0–10
  lengthAdequate: boolean;
  toneLinkedIn: boolean;
  issues: string[];
  suggestions: string[];
}

export interface HumanFeedback {
  decision: "approve" | "reject";
  comments?: string;
  timestamp: string; // ISO 8601
}

// status 

export type AgentStatus =
  | "idle"
  | "researching"
  | "analyzing"
  | "writing"
  | "critiquing"
  | "awaiting_review"
  | "revising"
  | "publishing"
  | "done"
  | "error";

  
// ─── Payloads SSE ─────────────────────────────────────────────────────────────
export interface StatusEvent {
  type: AgentStatus;
  threadId: string;
  payload?: {
    draft?: string;
    critique?: CritiqueResult;
    revisionCount?: number;
    finalPostUrl?: string;
    error?: string;
  };
}

// ─── API request / response ───────────────────────────────────────────────────
export interface RunRequest {
  topic: string;
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
