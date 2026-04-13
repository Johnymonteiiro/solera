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
      "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-transparent",
  },
  revisao: {
    label: "revisão",
    className:
      "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-transparent",
  },
  escrevendo: {
    label: "escrevendo",
    className:
      "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-transparent",
  },
  erro: {
    label: "erro",
    className:
      "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-transparent",
  },
  pendente: {
    label: "pendente",
    className:
      "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-transparent",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[11px] font-medium rounded-[6px] px-2.5 py-0.5",
        config.className,
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
