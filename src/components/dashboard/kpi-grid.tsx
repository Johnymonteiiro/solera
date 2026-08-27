"use client";

import { DashboardStats } from "@/app/api/mas/dashboard-stats/route";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BarChart3, CheckCircle, Eye, Play } from "lucide-react";
import * as React from "react";

const POLL_MS = 5_000;

type Trend = "up" | "down" | "flat" | "warning";

interface BadgeData {
  trend: string;
  trendType: Trend;
}

// Compara duas contagens semanais e devolve label + tom.
// - delta > 0 → "↑ +N esta semana" verde
// - delta < 0 → "↓ -N vs semana anterior" vermelho
// - delta = 0 → "→ estável" mudo
function weeklyBadge(current: number, previous: number): BadgeData {
  const delta = current - previous;
  if (delta > 0) {
    return { trend: `+${delta} esta semana`, trendType: "up" };
  }
  if (delta < 0) {
    return {
      trend: `${delta} vs semana anterior`,
      trendType: "down",
    };
  }
  return { trend: "estável", trendType: "flat" };
}

// Approval rate delta em pontos percentuais.
function approvalBadge(current: number, previous: number): BadgeData {
  const delta = current - previous;
  if (delta > 0) {
    return { trend: `+${delta}pp vs semana anterior`, trendType: "up" };
  }
  if (delta < 0) {
    return { trend: `${delta}pp vs semana anterior`, trendType: "down" };
  }
  return { trend: "estável", trendType: "flat" };
}

export function KpiGrid() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/mas/dashboard-stats", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardStats;
        if (!cancelled) setStats(data);
      } catch {
        // ignora — mantém valor anterior
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const handler = () => {
      void refresh();
    };
    window.addEventListener("mas:thread-created", handler);
    window.addEventListener("mas:refresh", handler);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("mas:thread-created", handler);
      window.removeEventListener("mas:refresh", handler);
    };
  }, []);

  const total = stats?.totalExecutions ?? 0;
  const published = stats?.publishedPosts ?? 0;
  const approval = stats?.approvalRate ?? 0;
  const inReview = stats?.inReview ?? 0;

  const execBadge = stats
    ? weeklyBadge(stats.executionsThisWeek, stats.executionsPrevWeek)
    : { trend: "—", trendType: "flat" as const };

  const pubBadge = stats
    ? weeklyBadge(stats.publishedThisWeek, stats.publishedPrevWeek)
    : { trend: "—", trendType: "flat" as const };

  const aprBadge = stats
    ? approvalBadge(stats.approvalRate, stats.approvalRatePrev)
    : { trend: "—", trendType: "flat" as const };

  // Em revisão: amber sempre que há pendência, mudo quando vazio.
  const reviewBadge: BadgeData =
    inReview > 0
      ? {
          trend: `${inReview} pendente${inReview === 1 ? "" : "s"}`,
          trendType: "warning",
        }
      : { trend: "nenhuma pendente", trendType: "flat" };

  return (
    <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
      <KpiCard
        label="Execuções totais"
        value={stats ? String(total) : "—"}
        icon={Play}
        trend={execBadge.trend}
        trendType={execBadge.trendType}
      />
      <KpiCard
        label="Posts publicados"
        value={stats ? String(published) : "—"}
        icon={BarChart3}
        trend={pubBadge.trend}
        trendType={pubBadge.trendType}
      />
      <KpiCard
        label="Taxa de aprovação"
        value={stats ? `${approval}%` : "—%"}
        icon={CheckCircle}
        trend={aprBadge.trend}
        trendType={aprBadge.trendType}
      />
      <KpiCard
        label="Em revisão"
        value={stats ? String(inReview) : "—"}
        icon={Eye}
        trend={reviewBadge.trend}
        trendType={reviewBadge.trendType}
      />
    </div>
  );
}
