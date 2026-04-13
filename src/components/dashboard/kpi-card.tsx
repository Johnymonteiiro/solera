import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

type TrendType = "up" | "down" | "flat";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  trendType?: TrendType;
}

const trendStyles: Record<TrendType, string> = {
  up: "bg-[var(--accent-green-dim)] text-[var(--accent-green)]",
  down: "bg-[var(--accent-red-dim)] text-[var(--accent-red)]",
  flat: "bg-[var(--bg-input)] text-[var(--text-secondary)]",
};

const trendPrefix: Record<TrendType, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  trendType = "flat",
}: KpiCardProps) {
  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-3">
      <CardContent className="flex flex-col gap-3 pt-5 pb-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <Icon size={13} strokeWidth={2} />
          {label}
        </div>
        <div className="text-[32px] font-bold leading-none text-[var(--text-accent)]">
          {value}
        </div>
        {trend && (
          <div
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              trendStyles[trendType],
            )}
          >
            {trendPrefix[trendType]} {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
