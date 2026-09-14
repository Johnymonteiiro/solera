"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Atalho para criar post, fixo no header de todas as telas do dashboard.
 *
 * Some em `/posts/novo`: ali o header já carrega a ação primária de disparar o
 * pipeline (`CriarPostAction`), e dois botões roxos lado a lado — um que navega
 * para a página onde você já está, outro que executa — é a receita de clicar no
 * errado.
 */
export function NovoPostButton() {
  const pathname = usePathname();
  if (pathname === "/posts/novo") return null;

  return (
    <Button asChild color="purple" size="sm" className="h-8 text-[12px]">
      <Link href="/posts/novo">
        <Plus size={14} />
        <span className="max-[640px]:hidden">Criar post</span>
      </Link>
    </Button>
  );
}
