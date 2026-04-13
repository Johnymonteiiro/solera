import { type LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl border border-dashed border-[var(--border-active)] text-[var(--text-muted)]">
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      )}
    </div>
  )
}
