import { NextRequest, NextResponse } from "next/server";
import { listPublishedPosts } from "@/app/MAS/lib/publishedPostsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Period = "24h" | "3d" | "7d" | "30d";

interface PeriodConfig {
  windowMs: number;
  bucketMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Cada período usa um tamanho de bucket diferente pra equilibrar resolução
// e densidade de pontos no chart.
const PERIODS: Record<Period, PeriodConfig> = {
  "24h": { windowMs: 24 * HOUR, bucketMs: HOUR }, // 24 pontos de 1h
  "3d": { windowMs: 3 * DAY, bucketMs: 6 * HOUR }, // 12 pontos de 6h
  "7d": { windowMs: 7 * DAY, bucketMs: DAY }, // 7 pontos diários
  "30d": { windowMs: 30 * DAY, bucketMs: DAY }, // 30 pontos diários
};

export interface TimeseriesPoint {
  // ISO timestamp do início do bucket — UI formata localmente.
  bucket: string;
  count: number;
}

export interface TimeseriesResponse {
  period: Period;
  points: TimeseriesPoint[];
  total: number;
}

function isPeriod(value: string | null): value is Period {
  return value === "24h" || value === "3d" || value === "7d" || value === "30d";
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("period");
  const period: Period = isPeriod(raw) ? raw : "7d";
  const { windowMs, bucketMs } = PERIODS[period];

  const published = await listPublishedPosts();
  const now = Date.now();
  // Alinha o "agora" ao final do bucket atual pra evitar drift visual quando
  // o intervalo de poll passa o limite de hora/dia.
  const windowStart = now - windowMs;

  const buckets = new Map<number, number>();
  // Pré-popula com zeros pra garantir continuidade — sem isso os dias
  // sem publicação somem do array.
  const bucketCount = Math.ceil(windowMs / bucketMs);
  const firstBucketStart =
    Math.floor(windowStart / bucketMs) * bucketMs;
  for (let i = 0; i < bucketCount; i++) {
    buckets.set(firstBucketStart + i * bucketMs, 0);
  }

  for (const post of published) {
    const t = Date.parse(post.publishedAt);
    if (!Number.isFinite(t) || t < windowStart) continue;
    const bucketKey = Math.floor(t / bucketMs) * bucketMs;
    buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + 1);
  }

  const points: TimeseriesPoint[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, count]) => ({
      bucket: new Date(ts).toISOString(),
      count,
    }));

  const total = points.reduce((sum, p) => sum + p.count, 0);

  const body: TimeseriesResponse = { period, points, total };
  return NextResponse.json(body);
}
