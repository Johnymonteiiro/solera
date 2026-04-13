import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { getSession } from "@/lib/sessions"
import { UserAvatarMenu } from "@/components/dashboard/user-avatar-menu"

interface TopbarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export async function Topbar({ title, subtitle, actions }: TopbarProps) {
  const session = await getSession()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-6 gap-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
        <Separator orientation="vertical" className="h-4 bg-[var(--border-subtle)]" />
        <div className="flex flex-col">
          <span className="text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
            {title}
          </span>
          {subtitle && (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {actions}
        {session && (
          <UserAvatarMenu name={session.name} email={session.email} />
        )}
      </div>
    </header>
  )
}
