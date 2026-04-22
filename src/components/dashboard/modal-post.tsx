"use client";

import { NavigatorProvider, SearchLanguage } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Globe, Languages, Loader2 } from "lucide-react";
import * as React from "react";

const MAX_CHARS = 300;
const MIN_CHARS = 10;

const PROVIDERS: { value: NavigatorProvider; label: string }[] = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave" },
];

const LANGUAGES: { value: SearchLanguage; label: string; short: string }[] = [
  { value: "pt-BR", label: "Português", short: "PT" },
  { value: "en-US", label: "English", short: "EN" },
];

interface ModalPostProps {
  trigger?: React.ReactNode;
}

export function ModalPost({ trigger }: ModalPostProps) {
  const [open, setOpen] = React.useState(false);
  const [topic, setTopic] = React.useState("");
  const [provider, setProvider] = React.useState<NavigatorProvider>("tavily");
  const [language, setLanguage] = React.useState<SearchLanguage>("pt-BR");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const charCount = topic.length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;

  function resetForm() {
    setTopic("");
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/mas/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          navigatorProvider: provider,
          language,
        }),
      });
      const data = (await res.json()) as { threadId?: string; error?: string };
      if (!res.ok || !data.threadId) {
        setError(data.error ?? "Falha ao iniciar execução");
        setSubmitting(false);
        return;
      }

      // notifica o dashboard pra atualizar o card de pipeline imediatamente
      window.dispatchEvent(
        new CustomEvent("mas:thread-created", {
          detail: { threadId: data.threadId },
        }),
      );

      // fecha o modal — o pipeline é acompanhado no dashboard
      setOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de rede");
      setSubmitting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    if (submitting) return;
    setOpen(val);
    if (!val) resetForm();
  }

  const currentLang = LANGUAGES.find((l) => l.value === language)!;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" color="purple" className="text-[13px]">
            Nova Publicação
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3.5 pr-10 sm:px-5 sm:py-4 sm:pr-12">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-[var(--accent-purple)]" />
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              Novo post LinkedIn
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none">
                  <Globe
                    size={12}
                    strokeWidth={2}
                    className="text-[var(--accent-purple)]"
                  />
                  {PROVIDERS.find((p) => p.value === provider)?.label}
                  <ChevronDown
                    size={11}
                    strokeWidth={2}
                    className="opacity-50"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[130px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Pesquisa web
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PROVIDERS.map((p) => (
                  <DropdownMenuItem
                    key={p.value}
                    onSelect={() => setProvider(p.value)}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <Globe size={12} strokeWidth={2} />
                      {p.label}
                    </span>
                    {provider === p.value && (
                      <span className="size-1.5 rounded-full bg-[var(--accent-purple)]" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="h-4 w-px bg-[var(--border-active)]" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none">
                  <Languages
                    size={12}
                    strokeWidth={2}
                    className="text-[var(--accent-purple)]"
                  />
                  {currentLang.short}
                  <ChevronDown
                    size={11}
                    strokeWidth={2}
                    className="opacity-50"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Idioma
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LANGUAGES.map((l) => (
                  <DropdownMenuItem
                    key={l.value}
                    onSelect={() => setLanguage(l.value)}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <Languages size={12} strokeWidth={2} />
                      {l.label}
                    </span>
                    {language === l.value && (
                      <span className="size-1.5 rounded-full bg-[var(--accent-purple)]" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-4 pb-5 pt-4 sm:px-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              Tópico ou contexto
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHARS))}
              rows={5}
              placeholder="Ex: O impacto da IA generativa nas equipes de produto em 2025..."
              className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]/40 transition-colors"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)]">
                Mínimo {MIN_CHARS} caracteres
              </span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  charCount > MAX_CHARS * 0.9
                    ? "text-[var(--accent-amber)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {charCount}/{MAX_CHARS}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--accent-red-dim)] bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
              {error}
            </div>
          )}

          <Button
            variant="default"
            color="purple"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="h-10 text-[13px] font-medium"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Iniciando pipeline...
              </>
            ) : (
              "Gerar post"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
