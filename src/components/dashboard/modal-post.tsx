"use client";

import { searchWebAction } from "@/app/agents/actions/search-action";
import { NavigatorProvider, ResearchResult, SearchLanguage } from "@/app/agents/types/types";
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
  { value: "en-US", label: "English",   short: "EN" },
];

interface ModalPostProps {
  trigger?: React.ReactNode;
}

export function ModalPost({ trigger }: ModalPostProps) {
  const [open, setOpen] = React.useState(false);
  const [topic, setTopic] = React.useState("");
  const [provider, setProvider] = React.useState<NavigatorProvider>("tavily");
  const [language, setLanguage] = React.useState<SearchLanguage>("pt-BR");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<ResearchResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const charCount = topic.length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;

  async function handleGenerate() {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    setResults(null);

    const response = await searchWebAction(topic, provider, language);

    if (response.error) {
      setError(response.error);
    } else {
      setResults(response.results ?? []);
    }

    setLoading(false);
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setTopic("");
      setResults(null);
      setError(null);
    }
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

      <DialogContent className="w-full max-w-[660px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 pr-12">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-[var(--accent-purple)]" />
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              Novo post LinkedIn
            </span>
          </div>

          {/* Controls: provider + language */}
          <div className="flex items-center gap-1.5">
            {/* Provider selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none">
                  <Globe size={12} strokeWidth={2} className="text-[var(--accent-purple)]" />
                  {PROVIDERS.find((p) => p.value === provider)?.label}
                  <ChevronDown size={11} strokeWidth={2} className="opacity-50" />
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

            {/* Divider */}
            <span className="h-4 w-px bg-[var(--border-active)]" />

            {/* Language selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none">
                  <Languages size={12} strokeWidth={2} className="text-[var(--accent-purple)]" />
                  {currentLang.short}
                  <ChevronDown size={11} strokeWidth={2} className="opacity-50" />
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
        <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
          {/* Textarea */}
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

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-[var(--accent-red-dim)] bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
              {error}
            </div>
          )}

          {/* Results preview */}
          {results && results.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                Resultados ({results.length})
              </span>
              <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2.5"
                  >
                    <span className="text-[12px] font-medium text-[var(--text-primary)] line-clamp-1">
                      {r.title}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                      {r.url}
                    </span>
                    <div>
                      <span className="text-[11px] text-[var(--text-secondary)] line-clamp-3">
                        {r.content}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results && results.length === 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-3 text-center text-[12px] text-[var(--text-muted)]">
              Nenhum resultado encontrado.
            </div>
          )}

          {/* CTAs */}
          <div className="flex gap-2.5">
            <Button
              variant="soft"
              color="purple"
              onClick={handleGenerate}
              disabled={!isValid || loading}
              className="h-10 flex-1 text-[13px] font-medium"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  A pesquisar...
                </>
              ) : (
                "Pesquisar tópico"
              )}
            </Button>
            <Button
              variant="soft"
              color="green"
              disabled
              className="h-10 flex-1 text-[13px] font-medium"
            >
              Gerar post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
