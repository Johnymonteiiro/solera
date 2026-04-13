"use client"

import { LogOut, Settings, User } from "lucide-react"
import Link from "next/link"

import { logout } from "@/app/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface UserAvatarMenuProps {
  name: string
  email: string
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function UserAvatarMenu({ name, email }: UserAvatarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full outline-none ring-[var(--accent-purple)] focus-visible:ring-2 cursor-pointer"
          aria-label="Menu do usuário"
        >
          <Avatar>
            <AvatarFallback className="bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] font-semibold text-xs">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-52 bg-[var(--bg-card)] border-[var(--border-subtle)]"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-[var(--text-primary)] text-sm font-medium leading-tight">
            {name}
          </span>
          <span className="text-[var(--text-muted)] text-xs font-normal">
            {email}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

        <DropdownMenuItem asChild>
          <Link
            href="/perfil"
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <User className="size-3.5" />
            Perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/configuracoes"
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Settings className="size-3.5" />
            Configurações
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-[var(--accent-red)] hover:text-[var(--accent-red)] cursor-pointer"
            >
              <LogOut className="size-3.5" />
              Sair
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
