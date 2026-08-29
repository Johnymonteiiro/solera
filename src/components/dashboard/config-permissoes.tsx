"use client";

import { AppUser, UsersTable } from "@/components/dashboard/users-table";
import { AREAS, ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type Area, type Role } from "@/lib/roles";
import { Info, RotateCcw } from "lucide-react";
import Link from "next/link";

// Aba Permissões: papéis, matriz de acesso e pessoas.
//
// Tudo aqui é controlado pelo shell (configuracoes-view): esta aba não salva
// nada sozinha — edita o rascunho e o botão "Salvar alterações" do cabeçalho
// commita. É o que permite o "Descartar" funcionar de verdade.

export type AccessMatrix = Record<"user" | "colaborador", Record<Area, boolean>>;

// AppUser mora em users-table (dono da tabela); re-exportado porque o shell da
// tela de configurações já o importava daqui.
export type { AppUser };

const ROLE_CHIP: Record<Role, string> = {
  admin:
    "text-[var(--accent-purple)] bg-[var(--accent-purple-dim)] border-[var(--accent-purple)]/35",
  colaborador:
    "text-[var(--accent-green)] bg-[var(--accent-green-dim)] border-[var(--accent-green)]/30",
  user: "text-[var(--text-secondary)] bg-[var(--bg-input)] border-[var(--border-subtle)]",
};


export function ConfigPermissoes({
  users,
  matrix,
  roleEdits,
  meuId,
  canEdit,
  onRole,
  onToggleArea,
  onResetMatrix,
}: {
  users: AppUser[] | null;
  matrix: AccessMatrix | null;
  roleEdits: Record<string, Role>;
  meuId: string;
  canEdit: boolean;
  onRole: (linkedinId: string, role: Role) => void;
  onToggleArea: (role: "user" | "colaborador", area: Area) => void;
  onResetMatrix: () => void;
}) {
  const papelDe = (u: AppUser): Role => roleEdits[u.linkedinId] ?? u.role;
  const lista = users ?? [];

  return (
    <div className="flex flex-col gap-7">
      {/* ─── Papéis ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Papéis
          </h2>
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            Toda conta nova que entra pelo LinkedIn começa como{" "}
            <strong className="font-medium text-[var(--text-primary)]">
              Usuário
            </strong>
            .
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3.5 max-[860px]:grid-cols-1">
          {ROLES.map((r) => {
            const n = lista.filter((u) => papelDe(u) === r).length;
            return (
              <div
                key={r}
                className="flex flex-col gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ROLE_CHIP[r]}`}
                  >
                    {ROLE_LABEL[r]}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    {n} {n === 1 ? "pessoa" : "pessoas"}
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  {ROLE_DESCRIPTION[r]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Matriz de acesso ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              Acesso por papel
            </h2>
            <p className="text-[12.5px] text-[var(--text-secondary)]">
              O que cada papel enxerga. Admin tem acesso total e não é editável.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={onResetMatrix}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw size={12} />
              Restaurar padrão
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 border-b border-[var(--border-subtle)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <span>Área</span>
              <span className="text-center">Usuário</span>
              <span className="text-center text-[var(--accent-green)]">
                Colaborador
              </span>
              <span className="text-center text-[var(--accent-purple)]">
                Admin
              </span>
            </div>

            {matrix === null ? (
              <div className="px-5 py-8 text-center text-[12px] text-[var(--text-muted)]">
                Carregando matriz...
              </div>
            ) : (
              AREAS.map((a) => (
                <div
                  key={a.id}
                  className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-2.5 transition-colors last:border-0 hover:bg-[var(--bg-card-hover)]"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {a.label}
                    </span>
                    <span className="text-[11.5px] text-[var(--text-muted)]">
                      {a.desc}
                    </span>
                  </div>
                  {(["user", "colaborador", "admin"] as const).map((r) => {
                    const travado = r === "admin";
                    const ligado = travado ? true : matrix[r][a.id];
                    return (
                      <div key={r} className="flex justify-center">
                        <button
                          type="button"
                          disabled={travado || !canEdit}
                          onClick={() =>
                            !travado && onToggleArea(r, a.id)
                          }
                          title={
                            travado
                              ? "Admin sempre tem acesso total"
                              : ligado
                                ? "Remover acesso"
                                : "Conceder acesso"
                          }
                          aria-pressed={ligado}
                          aria-label={`${a.label} — ${ROLE_LABEL[r]}`}
                          className={`flex h-[22px] w-[38px] items-center rounded-full border p-[2px] transition-colors ${
                            ligado
                              ? r === "colaborador"
                                ? "border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)]"
                                : r === "admin"
                                  ? "border-[var(--accent-purple)]/40 bg-[var(--accent-purple-dim)]"
                                  : "border-[var(--text-muted)] bg-[var(--bg-card-hover)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-input)]"
                          } ${travado || !canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        >
                          <span
                            className={`size-4 rounded-full transition-transform ${
                              ligado
                                ? `translate-x-4 ${
                                    r === "colaborador"
                                      ? "bg-[var(--accent-green)]"
                                      : r === "admin"
                                        ? "bg-[var(--accent-purple)]"
                                        : "bg-[var(--text-primary)]"
                                  }`
                                : "translate-x-0 bg-[var(--text-muted)]"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ─── Pessoas ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        {/* Sem `showActivity`: posts e status são gestão de gente e moram em
            /usuarios. Aqui a pergunta é só quem tem qual papel. */}
        <UsersTable
          users={users}
          meuId={meuId}
          canEdit={canEdit}
          roleEdits={roleEdits}
          onRole={onRole}
        />
        <p className="flex items-start gap-2 p-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
          <Info size={13} className="mt-0.5 shrink-0 text-[var(--accent-purple)]" />
          <span>
            O último admin não pode se rebaixar — promova outro antes. Para
            desligar o acesso de alguém de vez, use{" "}
            <Link
              href="/usuarios"
              className="text-[var(--accent-purple)] hover:underline"
            >
              Usuários
            </Link>
            .
          </span>
        </p>
      </section>
    </div>
  );
}
