import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

type TrendType = "up" | "down" | "flat" | "warning";

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
  warning: "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]",
};

const trendPrefix: Record<TrendType, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
  warning: "●",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  trendType = "flat",
}: KpiCardProps) {
  return (
    // `size="sm"` é o que realmente encolhe: o <Card> já traz `py-4` próprio, e
    // o `py-*` que estava no CardContent SOMAVA com ele em vez de substituir —
    // por isso a primeira tentativa de diminuir quase não mudou nada. Aqui o
    // padding vertical vem só do Card (py-3), e o CardContent não põe nenhum.
    <Card
      size="sm"
      className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0"
    >
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
          <Icon size={11} strokeWidth={2} />
          {label}
        </div>
        <div className="text-[20px] leading-none font-bold text-[var(--text-accent)]">
          {value}
        </div>
        {trend && (
          <div
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
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
