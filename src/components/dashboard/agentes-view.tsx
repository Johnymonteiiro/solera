"use client";

import { AGENTS } from "@/components/dashboard/pipeline-agents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Loader2, Save } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

// Espelha o shape de AgentConfigMap sem importar o store (que usa node:fs).
interface AgentConfig {
  enabled: boolean;
  role: string;
  promptOverride: string;
}
type AgentId =
  | "researcher"
  | "analyst"
  | "writer"
  | "judge"
  | "hitl"
  | "publisher";
type AgentConfigMap = Record<AgentId, AgentConfig>;

// Duas colunas INDEPENDENTES (masonry) — assim expandir/togglar um card não
// mexe na coluna vizinha (num CSS grid comum as linhas são compartilhadas).
// Ordem preserva a leitura do grid original (linha a linha).
const COLUMNS: AgentId[][] = [
  ["researcher", "writer", "hitl"],
  ["analyst", "judge", "publisher"],
];

// Agentes centrais: desligar quebra a geração (aviso). Os demais têm semântica própria.
const DISABLE_NOTE: Record<AgentId, string> = {
  researcher: "⚠ Desligar interrompe a pesquisa — o pipeline não terá fontes.",
  analyst: "⚠ Desligar deixa o pipeline sem insights — o writer aborta.",
  writer: "⚠ Desligar impede a geração do rascunho.",
  judge: "Desligar = sem loop de reescrita (o judge ainda pontua uma vez).",
  hitl: "Desligar = auto-aprova, sem revisão humana.",
  publisher: "Desligar = não publica no LinkedIn (encerra com o rascunho pronto).",
};

const META = Object.fromEntries(
  AGENTS.map((a) => [a.id, { label: a.label, icon: a.icon }]),
) as Record<AgentId, { label: string; icon: (typeof AGENTS)[number]["icon"] }>;

export function AgentesView() {
  const [config, setConfig] = React.useState<AgentConfigMap | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<AgentId>>(new Set());

  function toggleExpanded(id: AgentId) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  React.useEffect(() => {
    fetch("/api/mas/agent-config")
      .then((r) => r.json())
      .then((d: { agents: AgentConfigMap }) => setConfig(d.agents))
      .catch(() => toast.error("Falha ao carregar config dos agentes"));
  }, []);

  function patch(id: AgentId, p: Partial<AgentConfig>) {
    setConfig((c) => (c ? { ...c, [id]: { ...c[id], ...p } } : c));
    setDirty(true);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mas/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: config }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setDirty(false);
      toast.success("Configuração salva");
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="py-20 text-center text-[13px] text-[var(--text-muted)]">
        Carregando agentes...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-muted)]">
          Ative/desative agentes. O <strong>papel</strong> entra como preâmbulo no
          prompt; o <strong>prompt (override)</strong> substitui/prependa o do código
          (vazio = usa o padrão).
        </p>
        <Button color="purple" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </Button>
      </div>

      <div className="grid grid-cols-2 items-start gap-3.5 max-[820px]:grid-cols-1">
        {COLUMNS.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-3.5">
            {col.map((id) => {
          const cfg = config[id];
          const meta = META[id];
          const Icon = meta?.icon;
          const noLlm = id === "hitl" || id === "publisher";
          const isOpen = expanded.has(id);
          const hasOverride = cfg.promptOverride.trim().length > 0;
          return (
            <div
              key={id}
              className={cn(
                "flex flex-col rounded-xl border bg-[var(--bg-card)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[border-color,opacity] duration-200 hover:border-[var(--border-active)]",
                cfg.enabled
                  ? "border-[var(--border-subtle)]"
                  : "border-dashed border-[var(--border-subtle)] opacity-75",
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {Icon && (
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                        cfg.enabled
                          ? "bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]"
                          : "bg-[var(--bg-input)] text-[var(--text-muted)]",
                      )}
                    >
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                      {meta?.label ?? id}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {id}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px]",
                      cfg.enabled
                        ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                        : "border-[var(--border-active)]/60 bg-[var(--bg-input)] text-[var(--text-muted)]",
                    )}
                  >
                    {cfg.enabled ? "ativo" : "inativo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch(id, { enabled: !cfg.enabled })}
                    aria-label="Ativar/desativar"
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                      cfg.enabled
                        ? "bg-[var(--accent-green)]"
                        : "bg-[var(--border-active)]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4 rounded-full bg-white transition-transform",
                        cfg.enabled ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>

              {!cfg.enabled && (
                <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-[var(--accent-amber-dim)] px-2.5 py-1.5 text-[11px] text-[var(--accent-amber)]">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {DISABLE_NOTE[id]}
                </div>
              )}

              {/* Papel */}
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Papel
                </span>
                <input
                  value={cfg.role}
                  onChange={(e) => patch(id, { role: e.target.value })}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-primary)] transition-colors focus:border-[var(--accent-purple)] focus:outline-none"
                />
              </label>

              {/* Prompt (colapsável) */}
              <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(id)}
                  className="flex w-full items-center justify-between gap-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <span className="flex items-center gap-1.5">
                    Prompt
                    {hasOverride ? (
                      <span className="rounded bg-[var(--accent-purple-dim)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent-purple)]">
                        override
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal text-[var(--text-muted)]">
                        padrão do código
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "shrink-0 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {/* Colapsável animado (grid-rows 0fr↔1fr) */}
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen
                      ? "mt-2 grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {id === "writer" || id === "judge"
                          ? "Prependado ao prompt do código."
                          : noLlm
                            ? "Agente sem LLM — não usa prompt."
                            : "Substitui o prompt do código."}
                      </span>
                      <textarea
                        value={cfg.promptOverride}
                        onChange={(e) =>
                          patch(id, { promptOverride: e.target.value })
                        }
                        rows={4}
                        tabIndex={isOpen ? 0 : -1}
                        placeholder="Vazio = usa o prompt padrão do código"
                        disabled={noLlm}
                        className="resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--accent-purple)] focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
