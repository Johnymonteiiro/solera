import { NextResponse } from "next/server";
import { listPublishedPosts } from "@/app/MAS/lib/publishedPostsStore";
import { listThreads } from "@/app/MAS/lib/threadStore";
import { AgentStatus } from "@/app/MAS/types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPLETED_STATUSES: AgentStatus[] = ["done", "stopped", "error"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DashboardStats {
  totalExecutions: number;
  publishedPosts: number;
  approvalRate: number; // 0-100, fração de threads completas que viraram post
  inReview: number; // threads aguardando HITL agora
  // Deltas vs semana anterior — usados nos badges de tendência.
  executionsThisWeek: number;
  executionsPrevWeek: number;
  publishedThisWeek: number;
  publishedPrevWeek: number;
  approvalRatePrev: number; // taxa de aprovação considerando apenas threads da semana anterior
}

function countWithinWindow(
  timestamps: string[],
  fromMs: number,
  toMs: number,
): number {
  return timestamps.filter((ts) => {
    const t = Date.parse(ts);
    return Number.isFinite(t) && t >= fromMs && t < toMs;
  }).length;
}

export async function GET() {
  const threads = await listThreads();
  const published = await listPublishedPosts();

  const now = Date.now();
  const weekAgo = now - WEEK_MS;
  const twoWeeksAgo = now - 2 * WEEK_MS;

  const completed = threads.filter((t) =>
    COMPLETED_STATUSES.includes(t.status),
  ).length;
  const inReview = threads.filter(
    (t) => t.status === "awaiting_review",
  ).length;
  const approvalRate =
    completed > 0 ? Math.round((published.length / completed) * 100) : 0;

  const threadTimestamps = threads.map((t) => t.createdAt);
  const publishedTimestamps = published.map((p) => p.publishedAt);

  const executionsThisWeek = countWithinWindow(threadTimestamps, weekAgo, now);
  const executionsPrevWeek = countWithinWindow(
    threadTimestamps,
    twoWeeksAgo,
    weekAgo,
  );
  const publishedThisWeek = countWithinWindow(
    publishedTimestamps,
    weekAgo,
    now,
  );
  const publishedPrevWeek = countWithinWindow(
    publishedTimestamps,
    twoWeeksAgo,
    weekAgo,
  );

  // Approval rate da semana anterior — pra mostrar delta no badge.
  const prevWeekThreads = threads.filter((t) => {
    const ts = Date.parse(t.createdAt);
    return (
      Number.isFinite(ts) &&
      ts >= twoWeeksAgo &&
      ts < weekAgo &&
      COMPLETED_STATUSES.includes(t.status)
    );
  }).length;
  const approvalRatePrev =
    prevWeekThreads > 0
      ? Math.round((publishedPrevWeek / prevWeekThreads) * 100)
      : 0;

  const stats: DashboardStats = {
    totalExecutions: threads.length,
    publishedPosts: published.length,
    approvalRate,
    inReview,
    executionsThisWeek,
    executionsPrevWeek,
    publishedThisWeek,
    publishedPrevWeek,
    approvalRatePrev,
  };

  return NextResponse.json(stats);
}
