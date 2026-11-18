"use client";

import { cn } from "@/lib/utils";
import { BarChart3, Table2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS: { href: string; label: string; desc: string; icon: LucideIcon }[] = [
  { href: "/estudo", label: "Dados", desc: "posts e notas por modelo", icon: Table2 },
  { href: "/estudo/benchmarks", label: "Benchmarks", desc: "comparação entre modelos", icon: BarChart3 },
];

/** Navegação secundária da área de estudo. Cada item é uma rota própria. */
export function EstudoSubnav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções do estudo"
      className="flex shrink-0 gap-1 border-[var(--border-subtle)] p-3 max-md:border-b md:w-52 md:flex-col md:border-r md:py-5"
    >
      {ITENS.map((item) => {
        const ativo = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors",
              ativo
                ? "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icon size={15} className="mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium">{item.label}</span>
              <span className="text-[10.5px] text-[var(--text-muted)] max-md:hidden">{item.desc}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
