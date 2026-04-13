"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  Bot,
  Eye,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Play,
  Settings,
  Wrench,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navPrincipal = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Execuções",
    href: "/execucoes",
    icon: Play,
    badge: "3",
    badgeVariant: "purple" as const,
  },
  {
    label: "Revisões",
    href: "/revisoes",
    icon: Eye,
    badge: "4",
    badgeVariant: "amber" as const,
  },
  {
    label: "Posts publicados",
    href: "/posts",
    icon: FileText,
  },
]

const navAgentes = [
  {
    label: "Configurar agentes",
    href: "/agentes",
    icon: Bot,
  },
  {
    label: "Ferramentas",
    href: "/ferramentas",
    icon: Wrench,
  },
  {
    label: "Prompts",
    href: "/prompts",
    icon: MessageSquare,
    badge: "New",
    badgeVariant: "new" as const,
  },
]

const navSistema = [
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    label: "LangSmith traces",
    href: "/langsmith",
    icon: Activity,
  },
]

const navBottom = [
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
  },
  {
    label: "Ajuda",
    href: "/ajuda",
    icon: HelpCircle,
  },
]

const badgeStyles = {
  purple: "bg-[var(--accent-purple)] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
  amber: "bg-[var(--accent-amber)] text-black text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
  new: "bg-[var(--accent-green-dim)] text-[var(--accent-green)] text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-[var(--border-subtle)] px-3.5 py-0 h-14 flex-row items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-purple)]">
          <svg width="14" height="14" viewBox="0 0 90 90" fill="none">
            <path
              d="M58 22C58 22 30 22 28 22C18 22 14 30 14 37C14 46 21 51 30 52L50 55C58 56 62 60 62 67C62 74 56 70 50 70L22 70"
              stroke="white"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col leading-tight overflow-hidden group-data-[collapsible=icon]:hidden">
          <span className="text-sm font-bold text-[var(--text-primary)]">Solera</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">multi-agent</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--text-muted)]">
            Principal
          </SidebarGroupLabel>
          <SidebarMenu>
            {navPrincipal.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && (
                  <SidebarMenuBadge>
                    <span className={badgeStyles[item.badgeVariant!]}>
                      {item.badge}
                    </span>
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--text-muted)]">
            Agentes
          </SidebarGroupLabel>
          <SidebarMenu>
            {navAgentes.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && (
                  <SidebarMenuBadge>
                    <span className={badgeStyles[item.badgeVariant!]}>
                      {item.badge}
                    </span>
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--text-muted)]">
            Sistema
          </SidebarGroupLabel>
          <SidebarMenu>
            {navSistema.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[var(--border-subtle)] py-3">
        <SidebarMenu>
          {navBottom.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.label}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
