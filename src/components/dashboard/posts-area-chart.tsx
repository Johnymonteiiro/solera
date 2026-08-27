"use client";

import {
  Period,
  TimeseriesResponse,
} from "@/app/api/mas/posts-timeseries/route";
import { Button } from "@/components/ui/button";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const POLL_MS = 15_000;

const PERIOD_LABEL: Record<Period, string> = {
  "24h": "24h",
  "3d": "3 dias",
  "7d": "7 dias",
  "30d": "30 dias",
};

const PERIODS: Period[] = ["24h", "3d", "7d", "30d"];

const chartConfig = {
  count: {
    label: "Publicados",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// Formatter do tick X — adapta granularidade ao período.
function formatTick(period: Period, iso: string): string {
  const d = new Date(iso);
  if (period === "24h" || period === "3d") {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTooltipLabel(period: Period, iso: string): string {
  const d = new Date(iso);
  if (period === "24h" || period === "3d") {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PostsAreaChart() {
  const [period, setPeriod] = React.useState<Period>("7d");
  const [data, setData] = React.useState<TimeseriesResponse | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch(
          `/api/mas/posts-timeseries?period=${period}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as TimeseriesResponse;
        if (!cancelled) setData(body);
      } catch {
        // ignora — mantém dados anteriores
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [period]);

  const total = data?.total ?? 0;
  const points = data?.points ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-[var(--text-primary)]">
            {total}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[1px] text-[var(--text-muted)]">
            posts publicados · {PERIOD_LABEL[period]}
          </span>
        </div>
        <div className="flex gap-0.5">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={p === period ? "flat" : "flat-ghost"}
              size="sm"
              onClick={() => setPeriod(p)}
              className="h-7 px-2.5 text-[11px]"
            >
              {PERIOD_LABEL[p]}
            </Button>
          ))}
        </div>
      </div>

      <div className="px-2 pt-4 pb-2 sm:px-5">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[240px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={points}
            margin={{ left: 4, right: 12, top: 8 }}
          >
            <defs>
              <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-count)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-count)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) => formatTick(period, value)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
              width={28}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    formatTooltipLabel(period, value as string)
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              strokeWidth={2}
              fill="url(#fillCount)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
