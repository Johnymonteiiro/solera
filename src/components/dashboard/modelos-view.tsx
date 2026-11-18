"use client";

import { PanelsSkeleton } from "@/components/dashboard/skeletons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Cpu, Loader2, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

// Espelha LlmModel sem importar o store (que toca o banco).
interface LlmModel {
  id: string;
  label: string;
  isDefault: boolean;
}

async function call(method: string, url: string, body?: unknown): Promise<LlmModel[]> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = (await res.json().catch(() => ({}))) as { models?: LlmModel[]; error?: string };
  if (!res.ok || !d.models) throw new Error(d.error ?? `Erro ${res.status}`);
  return d.models;
}

export function ModelosView() {
  const [models, setModels] = React.useState<LlmModel[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [novoId, setNovoId] = React.useState("");
  const [novoLabel, setNovoLabel] = React.useState("");

  React.useEffect(() => {
    call("GET", "/api/mas/models")
      .then(setModels)
      .catch(() => toast.error("Falha ao carregar modelos"));
  }, []);

  async function run(key: string, fn: () => Promise<LlmModel[]>, ok: string) {
    setBusy(key);
    try {
      setModels(await fn());
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error("Não deu certo", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      "add",
      () => call("POST", "/api/mas/models", { id: novoId.trim(), label: novoLabel.trim() }),
      "Modelo adicionado",
    );
    if (ok) {
      setNovoId("");
      setNovoLabel("");
    }
  }

  if (!models) return <PanelsSkeleton cards={3} className="mx-auto w-full max-w-3xl" />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <p className="text-[12px] text-[var(--text-muted)]">
        Modelo que <strong>escreve</strong> os posts (Writer), via OpenRouter. O padrão vale
        para as próximas execuções; cada execução grava o modelo que usou. Researcher,
        Analyst e Critic não mudam aqui (ver Configurar agentes).
      </p>

      <div className="flex flex-col gap-2.5">
        {models.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-[var(--bg-card)] p-4 transition-colors",
              m.isDefault
                ? "border-[var(--accent-purple)]/50"
                : "border-[var(--border-subtle)] hover:border-[var(--border-active)]",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
              <Cpu size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                {m.label}
                {m.isDefault && (
                  <span className="rounded bg-[var(--accent-purple-dim)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--accent-purple)]">
                    padrão
                  </span>
                )}
              </span>
              <span className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                {m.id}
              </span>
            </div>
            {!m.isDefault && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `default:${m.id}`,
                      () => call("PUT", "/api/mas/models", { defaultId: m.id }),
                      `${m.label} agora é o padrão`,
                    )
                  }
                >
                  {busy === `default:${m.id}` ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Usar como padrão
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remover ${m.label}`}
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `del:${m.id}`,
                      () => call("DELETE", `/api/mas/models?id=${encodeURIComponent(m.id)}`),
                      "Modelo removido",
                    )
                  }
                >
                  {busy === `del:${m.id}` ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={adicionar}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Slug no OpenRouter
          </span>
          <input
            value={novoId}
            onChange={(e) => setNovoId(e.target.value)}
            placeholder="provedor/modelo, ex.: openai/gpt-4.1"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] focus:border-[var(--accent-purple)] focus:outline-none"
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Nome
          </span>
          <input
            value={novoLabel}
            onChange={(e) => setNovoLabel(e.target.value)}
            placeholder="opcional"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-primary)] focus:border-[var(--accent-purple)] focus:outline-none"
          />
        </label>
        <Button color="purple" size="sm" type="submit" disabled={!novoId.trim() || busy !== null}>
          {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar
        </Button>
      </form>
    </div>
  );
}
