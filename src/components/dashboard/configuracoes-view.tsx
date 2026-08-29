"use client";

import {
  AccessMatrix,
  AppUser,
  ConfigPermissoes,
} from "@/components/dashboard/config-permissoes";
import { ConfigChaves } from "@/components/dashboard/config-chaves";
import { ConfigVariaveis } from "@/components/dashboard/config-variaveis";
import { Button } from "@/components/ui/button";
import { DEFAULT_ACCESS, ROLE_LABEL, type Area, type Role } from "@/lib/roles";
import {
  FieldState,
  SECRET_FIELDS,
  WORKSPACE_FIELDS,
} from "@/lib/settings-fields";
import { Loader2, Save } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Tela de configurações: três abas, um único ponto de salvamento.
//
// O rascunho vive TODO aqui e as abas são apresentação — é o que faz o
// "Descartar" existir de verdade e o que permite mexer em chave, matriz e papel
// na mesma passada e commitar de uma vez. Salvar dispara até três chamadas
// (settings, matriz, papéis), mas só as que têm alteração pendente.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = "permissoes" | "chaves" | "variaveis";

const ABAS: { id: Aba; label: string }[] = [
  { id: "permissoes", label: "Permissões" },
  { id: "chaves", label: "API Key" },
  { id: "variaveis", label: "Variáveis" },
];

function mesmaMatriz(a: AccessMatrix, b: AccessMatrix): boolean {
  return (["user", "colaborador"] as const).every((r) =>
    Object.keys(a[r]).every((k) => a[r][k as Area] === b[r][k as Area]),
  );
}

export function ConfiguracoesView({
  role,
  meuId,
}: {
  role: Role;
  meuId: string;
}) {
  const admin = role === "admin";

  const [aba, setAba] = React.useState<Aba>(admin ? "permissoes" : "chaves");
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);

  // Estado do servidor (a base contra a qual o rascunho é comparado).
  const [state, setState] = React.useState<Record<string, FieldState>>({});
  const [canEdit, setCanEdit] = React.useState(false);
  const [users, setUsers] = React.useState<AppUser[] | null>(null);
  const [matrizBase, setMatrizBase] = React.useState<AccessMatrix | null>(null);

  // Rascunho.
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [matriz, setMatriz] = React.useState<AccessMatrix | null>(null);
  const [roleEdits, setRoleEdits] = React.useState<Record<string, Role>>({});

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const rSettings = await fetch("/api/mas/settings");
      if (!rSettings.ok) throw new Error(`settings ${rSettings.status}`);
      const d = await rSettings.json();
      setState(d.state ?? {});
      setCanEdit(!!d.canEdit);

      // Usuários e matriz são admin-only: um não-admin com acesso à área
      // `config` vê as outras duas abas e nada quebra.
      if (admin) {
        const [rU, rM] = await Promise.all([
          fetch("/api/mas/users"),
          fetch("/api/mas/role-permissions"),
        ]);
        if (rU.ok) setUsers((await rU.json()).users ?? []);
        if (rM.ok) {
          const m = (await rM.json()).matrix as AccessMatrix;
          setMatrizBase(m);
          setMatriz({ user: { ...m.user }, colaborador: { ...m.colaborador } });
        }
      }
    } catch {
      toast.error("Falha ao carregar configurações");
    } finally {
      setCarregando(false);
    }
  }, [admin]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  // ─── Rascunho ─────────────────────────────────────────────────────────────

  const onCampo = (key: string, value: string) =>
    setEdits((e) => ({ ...e, [key]: value }));

  const onToggleArea = (r: "user" | "colaborador", area: Area) =>
    setMatriz((m) =>
      m ? { ...m, [r]: { ...m[r], [area]: !m[r][area] } } : m,
    );

  // Restaurar padrão mexe no RASCUNHO, não no servidor: os toggles voltam ao
  // padrão na hora e a pessoa ainda pode Descartar. O mesmo DEFAULT_ACCESS é o
  // que o servidor semeia, então os dois lados concordam por construção.
  const onResetMatrix = () =>
    setMatriz({
      user: { ...DEFAULT_ACCESS.user },
      colaborador: { ...DEFAULT_ACCESS.colaborador },
    });

  const onRole = (linkedinId: string, novo: Role) =>
    setRoleEdits((r) => {
      const original = users?.find((u) => u.linkedinId === linkedinId)?.role;
      const next = { ...r };
      // Voltar ao papel original deixa de ser alteração pendente.
      if (novo === original) delete next[linkedinId];
      else next[linkedinId] = novo;
      return next;
    });

  const matrizSuja =
    !!matriz && !!matrizBase && !mesmaMatriz(matriz, matrizBase);
  const sujo =
    Object.keys(edits).length > 0 ||
    Object.keys(roleEdits).length > 0 ||
    matrizSuja;

  function descartar() {
    setEdits({});
    setRoleEdits({});
    if (matrizBase) {
      setMatriz({
        user: { ...matrizBase.user },
        colaborador: { ...matrizBase.colaborador },
      });
    }
  }

  async function salvar() {
    setSalvando(true);
    const falhas: string[] = [];

    try {
      if (Object.keys(edits).length) {
        const r = await fetch("/api/mas/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: edits }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          falhas.push(`chaves: ${d.error ?? r.status}`);
        }
      }

      if (matrizSuja) {
        const r = await fetch("/api/mas/role-permissions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matrix: matriz }),
        });
        if (!r.ok) falhas.push(`matriz: ${r.status}`);
      }

      // Um PATCH por pessoa alterada. Sequencial de propósito: a trava do
      // último admin é avaliada no servidor a cada chamada, e em paralelo duas
      // despromoções poderiam passar pela checagem ao mesmo tempo.
      for (const [linkedinId, novo] of Object.entries(roleEdits)) {
        const r = await fetch("/api/mas/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedinId, role: novo }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          const nome =
            users?.find((u) => u.linkedinId === linkedinId)?.name ?? linkedinId;
          falhas.push(`${nome}: ${d.message ?? d.error ?? r.status}`);
        }
      }

      if (falhas.length) {
        toast.error("Nem tudo foi salvo", { description: falhas.join(" · ") });
      } else {
        toast.success("Configurações salvas");
      }

      // Recarrega sempre: mesmo com falha parcial, o que colou tem que aparecer.
      setEdits({});
      setRoleEdits({});
      await carregar();
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setSalvando(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const contagem: Record<Aba, number> = {
    permissoes: users?.length ?? 0,
    chaves: SECRET_FIELDS.length,
    variaveis: WORKSPACE_FIELDS.length,
  };

  const abasVisiveis = ABAS.filter((a) => a.id !== "permissoes" || admin);

  if (carregando) {
    return (
      <div className="py-20 text-center text-[13px] text-[var(--text-muted)]">
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho: papel, estado do rascunho e as ações. */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[var(--accent-purple)]/35 bg-[var(--accent-purple-dim)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--accent-purple)]">
              {ROLE_LABEL[role]}
            </span>
            <p className="text-[12.5px] text-[var(--text-secondary)]">
              {canEdit
                ? "Papéis, credenciais e variáveis do workspace. Valores aqui sobrepõem o .env."
                : "Somente leitura — só administradores alteram a configuração global."}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] text-[var(--text-muted)]">
              {sujo ? "Alterações não salvas" : "Tudo salvo"}
            </span>
            <button
              onClick={descartar}
              disabled={!sujo || salvando}
              className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Descartar
            </button>
            <Button
              color="purple"
              size="sm"
              onClick={salvar}
              disabled={!sujo || salvando}
            >
              {salvando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Salvar alterações
            </Button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div
        role="tablist"
        className="mb-7 flex gap-7 border-b border-[var(--border-subtle)]"
      >
        {abasVisiveis.map((a) => {
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa}
              onClick={() => setAba(a.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-0.5 pb-3 text-[13.5px] font-medium transition-colors ${
                ativa
                  ? "border-[var(--accent-purple)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {a.label}
              <span
                className={`rounded-md px-1.5 py-px font-mono text-[10.5px] ${
                  ativa
                    ? "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                    : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                {contagem[a.id]}
              </span>
            </button>
          );
        })}
      </div>

      {aba === "permissoes" && admin && (
        <ConfigPermissoes
          users={users}
          matrix={matriz}
          roleEdits={roleEdits}
          meuId={meuId}
          canEdit={canEdit}
          onRole={onRole}
          onToggleArea={onToggleArea}
          onResetMatrix={onResetMatrix}
        />
      )}

      {aba === "chaves" && (
        <ConfigChaves
          state={state}
          edits={edits}
          canEdit={canEdit}
          onChange={onCampo}
        />
      )}

      {aba === "variaveis" && (
        <ConfigVariaveis
          state={state}
          edits={edits}
          canEdit={canEdit}
          onChange={onCampo}
        />
      )}
    </div>
  );
}
