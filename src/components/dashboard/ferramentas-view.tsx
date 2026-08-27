"use client";

import { NavigatorProvider } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Globe, Loader2, Save, Search, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

interface ToolsConfig {
  search: { provider: NavigatorProvider; maxResults: number };
}

const PROVIDERS: { value: NavigatorProvider; label: string }[] = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave" },
];

export function FerramentasView() {
  const [cfg, setCfg] = React.useState<ToolsConfig | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/mas/tools-config")
      .then((r) => r.json())
      .then((d: { tools: ToolsConfig }) => setCfg(d.tools))
      .catch(() => toast.error("Falha ao carregar ferramentas"));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mas/tools-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: cfg.search }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setDirty(false);
      toast.success("Ferramentas salvas");
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return (
      <div className="py-20 text-center text-[13px] text-[var(--text-muted)]">
        Carregando ferramentas...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-muted)]">
          Ferramentas usadas pelos agentes e suas configurações.
        </p>
        <Button color="purple" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </Button>
      </div>

      {/* search_web */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
            <Search size={16} />
          </span>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              search_web
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              pesquisa web usada pelo Researcher
            </span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Provider
            </span>
            <div className="flex gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setCfg((c) => c && { ...c, search: { ...c.search, provider: p.value } });
                    setDirty(true);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                    cfg.search.provider === p.value
                      ? "border-[var(--accent-purple)]/40 bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
                  )}
                >
                  <Globe size={12} /> {p.label}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Máx. resultados (1–20)
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={cfg.search.maxResults}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCfg((c) => c && { ...c, search: { ...c.search, maxResults: v } });
                setDirty(true);
              }}
              className="w-28 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] focus:border-[var(--accent-purple)] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* publishPost (read-only) */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
            <Share2 size={16} />
          </span>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              publishPost
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              publica no LinkedIn (API v202509) — usada pelo Publisher
            </span>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          As credenciais do LinkedIn são configuradas em{" "}
          <span className="text-[var(--accent-purple)]">Configurações</span>.
        </p>
      </div>
    </div>
  );
}
