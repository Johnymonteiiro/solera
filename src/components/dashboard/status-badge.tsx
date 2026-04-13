import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "publicado" | "revisao" | "escrevendo" | "erro" | "pendente";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  publicado: {
    label: "publicado",
    className:
      "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[var(--accent-green)]/20",
  },
  revisao: {
    label: "revisão",
    className:
      "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/20",
  },
  escrevendo: {
    label: "escrevendo...",
    className:
      "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/20",
  },
  erro: {
    label: "erro",
    className:
      "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-[var(--accent-red)]/20",
  },
  pendente: {
    label: "pendente",
    className:
      "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-[var(--accent-purple)]/20",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        config.className,
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
