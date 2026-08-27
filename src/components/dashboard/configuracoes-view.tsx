"use client";

import { Button } from "@/components/ui/button";
import { KeyRound, Loader2, Save, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

interface SettingsResponse {
  settings: {
    apiKeys: Record<string, string>;
    linkedin: { clientId?: string; clientSecret?: string; redirectUri?: string };
  };
  envPresent: Record<string, boolean>;
  linkedinEnv: { clientId: boolean; clientSecret: boolean; redirectUri: boolean };
}

const API_FIELDS: { key: string; label: string; secret: boolean }[] = [
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", secret: true },
  { key: "LLM_MODEL", label: "Modelo LLM (ex: gpt-4o)", secret: false },
  { key: "TAVILY_API_KEY", label: "Tavily API Key", secret: true },
  { key: "BRAVE_API_KEY", label: "Brave API Key", secret: true },
  { key: "BRAVE_URL", label: "Brave URL", secret: false },
];

const LINKEDIN_FIELDS: { key: string; label: string; secret: boolean }[] = [
  { key: "clientId", label: "Client ID", secret: false },
  { key: "clientSecret", label: "Client Secret", secret: true },
  { key: "redirectUri", label: "Redirect URI", secret: false },
];

export function ConfiguracoesView() {
  const [data, setData] = React.useState<SettingsResponse | null>(null);
  const [apiKeys, setApiKeys] = React.useState<Record<string, string>>({});
  const [linkedin, setLinkedin] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/mas/settings")
      .then((r) => r.json())
      .then((d: SettingsResponse) => {
        setData(d);
        setApiKeys({ ...d.settings.apiKeys });
        setLinkedin({ ...d.settings.linkedin });
      })
      .catch(() => toast.error("Falha ao carregar configurações"));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/mas/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys, linkedin }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setDirty(false);
      toast.success("Configurações salvas");
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-[13px] text-[var(--text-muted)]">
        Carregando configurações...
      </div>
    );
  }

  const field = (
    f: { key: string; label: string; secret: boolean },
    value: string,
    onChange: (v: string) => void,
    envPresent: boolean,
  ) => (
    <label key={f.key} className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {f.label}
        {envPresent && !value && (
          <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[9px] normal-case text-[var(--accent-green)]">
            usando .env
          </span>
        )}
      </span>
      <input
        type={f.secret ? "password" : "text"}
        value={value}
        autoComplete="off"
        placeholder={envPresent ? "definido no .env — preencha para sobrepor" : "não definido"}
        onChange={(e) => {
          onChange(e.target.value);
          setDirty(true);
        }}
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-muted)]">
          Chaves e credenciais. Valores aqui sobrepõem o .env (salvos em disco).
        </p>
        <Button color="purple" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </Button>
      </div>

      {/* Chaves de API */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
            <KeyRound size={16} />
          </span>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            Chaves de API
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
          {API_FIELDS.map((f) =>
            field(
              f,
              apiKeys[f.key] ?? "",
              (v) => setApiKeys((a) => ({ ...a, [f.key]: v })),
              !!data.envPresent[f.key],
            ),
          )}
        </div>
      </div>

      {/* LinkedIn */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--accent-purple)]">
            <Share2 size={16} />
          </span>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            LinkedIn (rede social)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
          {LINKEDIN_FIELDS.map((f) =>
            field(
              f,
              linkedin[f.key] ?? "",
              (v) => setLinkedin((a) => ({ ...a, [f.key]: v })),
              !!data.linkedinEnv[f.key as keyof typeof data.linkedinEnv],
            ),
          )}
        </div>
      </div>
    </div>
  );
}
