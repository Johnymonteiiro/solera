import { PostSize } from "./types/types";

// ─── Constantes globais ───────────────────────────────────────────────────────
export const MAX_REVISIONS = 3;
export const LINKEDIN_MAX_CHARS = 3000;
export const SSE_KEEPALIVE_MS = 15_000;

// Ranges de comprimento por tamanho de post.
// Calibrados com dados de engajamento do LinkedIn 2026 (AuthoredUp, 372k posts).
export const POST_SIZE_RANGES: Record<
  PostSize,
  { min: number; max: number; label: string; hint: string }
> = {
  small: {
    min: 500,
    max: 900,
    label: "Pequeno",
    hint: "insight único, hot take",
  },
  medium: {
    min: 1200,
    max: 1800,
    label: "Médio",
    hint: "balanceado, storytelling",
  },
  large: {
    min: 2000,
    max: 2800,
    label: "Grande",
    hint: "deep dive, autoridade",
  },
};
