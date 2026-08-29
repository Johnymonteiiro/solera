"use client";

import { AppUser, UsersTable } from "@/components/dashboard/users-table";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { ShieldCheck, UserCog, UserX } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

// Página /usuarios: gestão de gente.
//
// Diferente da aba Permissões, aqui cada ação SALVA NA HORA — não há botão de
// "Salvar alterações" na tela, e acumular rascunho num lugar que existe para
// desligar o acesso de alguém seria pedir para a pessoa esquecer de commitar.
// A tabela é a mesma; quem decide o momento de salvar é o host.

export function UsuariosView({ meuId }: { meuId: string }) {
  const [users, setUsers] = React.useState<AppUser[] | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch("/api/mas/users");
      if (!r.ok) throw new Error(String(r.status));
      setUsers((await r.json()).users ?? []);
    } catch {
      toast.error("Falha ao carregar usuários");
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    try {
      const r = await fetch("/api/mas/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message ?? d.error ?? `Erro ${r.status}`);
      // A rota devolve a lista já atualizada — evita uma segunda ida ao banco
      // e mantém contagem de posts e status coerentes com o que foi gravado.
      if (d.users) setUsers(d.users);
      else await carregar();
      toast.success(sucesso);
    } catch (err) {
      toast.error("Não foi possível salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const lista = users ?? [];
  const ativos = lista.filter((u) => u.active);
  const totalPosts = lista.reduce((s, u) => s + u.postCount, 0);

  const cards = [
    {
      icone: UserCog,
      label: "Contas",
      valor: lista.length,
      detalhe: `${ativos.length} ativa${ativos.length === 1 ? "" : "s"}`,
    },
    {
      icone: ShieldCheck,
      label: "Admins",
      valor: lista.filter((u) => u.role === "admin" && u.active).length,
      detalhe: "com acesso total",
    },
    {
      icone: UserX,
      label: "Nunca usaram",
      valor: lista.filter((u) => u.postCount === 0).length,
      detalhe: `${totalPosts} post${totalPosts === 1 ? "" : "s"} no total`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3.5 max-[860px]:grid-cols-1">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
              <c.icone size={16} />
            </span>
            <div className="flex flex-col">
              <span className="text-[18px] font-semibold leading-tight text-[var(--text-primary)]">
                {users === null ? "—" : c.valor}
              </span>
              <span className="text-[11.5px] text-[var(--text-muted)]">
                {c.label} · {c.detalhe}
              </span>
            </div>
          </div>
        ))}
      </div>

      <section
        className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] ${
          ocupado ? "pointer-events-none opacity-70" : ""
        }`}
      >
        <UsersTable
          users={users}
          meuId={meuId}
          canEdit
          showActivity
          onRole={(id, role) => {
            const nome =
              lista.find((u) => u.linkedinId === id)?.name ?? "Usuário";
            void patch({ linkedinId: id, role }, `${nome} agora é ${ROLE_LABEL[role]}`);
          }}
          onActive={(id, active) => {
            const nome =
              lista.find((u) => u.linkedinId === id)?.name ?? "Usuário";
            void patch(
              { linkedinId: id, active },
              active ? `${nome} reativado` : `${nome} desativado`,
            );
          }}
        />
        <p className="border-t border-[var(--border-subtle)] p-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Desativar bloqueia o login e derruba a sessão em curso — o papel é lido
          do banco a cada requisição, então não há espera pelo cookie expirar. Os
          posts da pessoa continuam no banco: nada é apagado, e por isso não
          existe excluir usuário. Papéis:{" "}
          {ROLES.map((r, i) => (
            <React.Fragment key={r}>
              {i > 0 && " · "}
              <strong className="font-medium text-[var(--text-secondary)]">
                {ROLE_LABEL[r]}
              </strong>
            </React.Fragment>
          ))}
          . Quem edita a matriz de acesso é a tela de Configurações.
        </p>
      </section>
    </div>
  );
}
