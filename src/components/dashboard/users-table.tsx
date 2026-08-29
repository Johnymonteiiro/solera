"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/roles";
import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// A tabela de pessoas, usada em dois lugares: dentro da aba Permissões (foco em
// papel) e na página /usuarios (foco em gestão, com atividade e status).
//
// Um componente só, com `showActivity` ligando as duas colunas extras — duas
// cópias divergiriam na próxima coluna, que foi exatamente o que aconteceu com
// a primeira versão desta tela.
//
// Componente BURRO de propósito: recebe callbacks e não decide quando salvar.
// A aba Permissões acumula rascunho e salva no botão do cabeçalho; a /usuarios
// salva na hora. Os dois comportamentos são legítimos, e quem escolhe é o host.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppUser {
  linkedinId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  postCount: number;
  createdAt: string;
  lastLoginAt: string;
}

export const ROLE_DOT: Record<Role, string> = {
  admin: "bg-[var(--accent-purple)]",
  colaborador: "bg-[var(--accent-green)]",
  user: "bg-[var(--text-secondary)]",
};

function iniciais(nome: string, email: string): string {
  const base = nome.trim() || email.trim();
  const partes = base.split(/[\s@.]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Dropdown de papel — o `select` nativo do sistema operacional não aceita o
 * ponto colorido nem a descrição de cada papel, e quem promove alguém precisa
 * ver o que está entregando na hora de escolher.
 *
 * Usa o DropdownMenu do projeto (radix), o mesmo do criar-post-view: fechar ao
 * clicar fora, Escape e navegação por teclado vêm de graça.
 */
export function RoleSelect({
  value,
  disabled,
  travadoMotivo,
  onPick,
}: {
  value: Role;
  disabled: boolean;
  travadoMotivo?: string;
  onPick: (r: Role) => void;
}) {
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      title={travadoMotivo}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2.5 py-2 text-[12.5px] text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-[var(--accent-purple)]"
    >
      <span className={`size-[7px] shrink-0 rounded-full ${ROLE_DOT[value]}`} />
      <span className="flex-1 text-left">{ROLE_LABEL[value]}</span>
      <ChevronDown size={11} className="shrink-0 opacity-50" />
    </button>
  );

  // Travado não vira dropdown: um menu que abre e não deixa escolher nada é
  // pior que um botão que não abre.
  if (disabled) return trigger;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[264px] p-1">
        {ROLES.map((r) => (
          <DropdownMenuItem
            key={r}
            onSelect={() => onPick(r)}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${
              r === value ? "bg-[var(--bg-card-hover)]" : ""
            }`}
          >
            <span
              className={`mt-[5px] size-[7px] shrink-0 rounded-full ${ROLE_DOT[r]}`}
            />
            {/* As cores vão com `!` de propósito: o DropdownMenuItem do shadcn
                aplica `focus:**:text-accent-foreground`, um seletor de
                descendente que pintaria título E descrição de roxo no hover e
                apagaria a hierarquia entre os dois. */}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[12.5px] font-medium text-[var(--text-primary)]!">
                {ROLE_LABEL[r]}
              </span>
              <span className="text-[11px] leading-snug text-[var(--text-muted)]!">
                {ROLE_DESCRIPTION[r]}
              </span>
            </span>
            {r === value && (
              <Check
                size={13}
                className="mt-0.5 shrink-0 text-[var(--accent-purple)]"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Chave/botão de status da conta. */
function StatusToggle({
  ativo,
  disabled,
  motivo,
  onToggle,
}: {
  ativo: boolean;
  disabled: boolean;
  motivo?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={motivo ?? (ativo ? "Desativar conta" : "Reativar conta")}
      onClick={onToggle}
      aria-pressed={ativo}
      className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
        ativo
          ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-muted)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-125"}`}
    >
      <span
        className={`size-[7px] rounded-full ${
          ativo ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"
        }`}
      />
      {ativo ? "Ativo" : "Inativo"}
    </button>
  );
}

export function UsersTable({
  users,
  meuId,
  canEdit,
  showActivity = false,
  roleEdits = {},
  onRole,
  onActive,
}: {
  users: AppUser[] | null;
  meuId: string;
  canEdit: boolean;
  /** Liga as colunas de posts e status — a página /usuarios usa, a config não. */
  showActivity?: boolean;
  /** Trocas de papel ainda não salvas (só o fluxo de rascunho usa). */
  roleEdits?: Record<string, Role>;
  onRole: (linkedinId: string, role: Role) => void;
  onActive?: (linkedinId: string, active: boolean) => void;
}) {
  const [busca, setBusca] = React.useState("");

  const lista = users ?? [];
  const papelDe = (u: AppUser): Role => roleEdits[u.linkedinId] ?? u.role;

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? lista.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
    : lista;

  // Quantos admins ATIVOS sobram se o rascunho for salvo. É o que trava a linha
  // antes do 409 do servidor — a UI não deve oferecer o caminho que ele recusa.
  const adminsAtivos = lista.filter((u) => papelDe(u) === "admin" && u.active);
  const ultimoAdmin = (u: AppUser) =>
    papelDe(u) === "admin" && u.active && adminsAtivos.length <= 1;

  const grid = showActivity
    ? "grid-cols-[1.6fr_0.7fr_1fr_70px_104px_180px]"
    : "grid-cols-[1.6fr_0.9fr_1fr_180px]";

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Pessoas{" "}
          <span className="font-normal text-[var(--text-muted)]">
            · {lista.length}
          </span>
        </h2>
        <div className="relative w-[280px] max-[640px]:w-[160px]">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-[12.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={showActivity ? "min-w-[840px]" : "min-w-[700px]"}>
          <div
            className={`grid ${grid} gap-4 border-b border-[var(--border-subtle)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]`}
          >
            <span>Pessoa</span>
            <span>Origem</span>
            <span>Último acesso</span>
            {showActivity && <span className="text-center">Posts</span>}
            {showActivity && <span>Status</span>}
            <span>Papel</span>
          </div>

          {users === null ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--text-muted)]">
              Carregando usuários...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--text-muted)]">
              {lista.length === 0
                ? "Ninguém logou ainda."
                : "Nenhuma pessoa encontrada."}
            </div>
          ) : (
            filtrados.map((u) => {
              const papel = papelDe(u);
              const travado = ultimoAdmin(u);
              const alterado = roleEdits[u.linkedinId] != null;
              const souEu = u.linkedinId === meuId;
              return (
                <div
                  key={u.linkedinId}
                  className={`grid ${grid} items-center gap-4 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors last:border-0 hover:bg-[var(--bg-card-hover)] ${
                    u.active ? "" : "opacity-55"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-input)] text-[11px] font-semibold text-[var(--text-secondary)]">
                      {iniciais(u.name, u.email)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                        <span className="truncate">
                          {u.name || "(sem nome)"}
                        </span>
                        {souEu && (
                          <span className="shrink-0 text-[9.5px] uppercase tracking-wider text-[var(--text-muted)]">
                            você
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[11.5px] text-[var(--text-muted)]">
                        {u.email || u.linkedinId}
                      </span>
                    </div>
                  </div>

                  {/* Toda conta nasce no callback do OAuth, então a origem é
                      sempre o LinkedIn hoje. A coluna existe porque é o que
                      responde "como essa pessoa entrou aqui" — se um dia
                      houver convite, o valor passa a variar. */}
                  <span className="font-mono text-[12px] text-[var(--text-muted)]">
                    linkedin
                  </span>

                  <span className="text-[12.5px] text-[var(--text-secondary)]">
                    {quando(u.lastLoginAt)}
                  </span>

                  {showActivity && (
                    <span
                      className={`text-center font-mono text-[12.5px] ${
                        u.postCount > 0
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)]"
                      }`}
                      title={`${u.postCount} execução(ões) do pipeline`}
                    >
                      {u.postCount}
                    </span>
                  )}

                  {showActivity && (
                    <StatusToggle
                      ativo={u.active}
                      disabled={!canEdit || souEu || (travado && u.active)}
                      motivo={
                        souEu
                          ? "Você não pode desativar a própria conta"
                          : travado && u.active
                            ? "Último admin ativo — promova ou ative outro antes"
                            : undefined
                      }
                      onToggle={() => onActive?.(u.linkedinId, !u.active)}
                    />
                  )}

                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <RoleSelect
                        value={papel}
                        disabled={!canEdit || travado || !u.active}
                        travadoMotivo={
                          !u.active
                            ? "Conta desativada — reative para mudar o papel"
                            : travado
                              ? "Último admin — promova outra pessoa antes de mudar"
                              : undefined
                        }
                        onPick={(r) => onRole(u.linkedinId, r)}
                      />
                    </div>
                    {alterado && (
                      <span
                        title="Alteração pendente — clique em Salvar alterações"
                        className="size-[7px] shrink-0 rounded-full bg-[var(--accent-amber)]"
                        aria-label="alteração pendente"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
