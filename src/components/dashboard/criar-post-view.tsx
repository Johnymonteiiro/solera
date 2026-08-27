"use client";

import { POST_SIZE_RANGES } from "@/app/MAS/constants";
import {
  AgentStatus,
  NavigatorProvider,
  PostSize,
  SearchLanguage,
  StatusEvent,
  StoppedReason,
} from "@/app/MAS/types/types";
import { ThreadArtifacts } from "@/components/dashboard/pipeline-agents";
import { PipelineVertical } from "@/components/dashboard/pipeline-vertical";
import { ReviewPopup } from "@/components/dashboard/review-popup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlignLeft,
  BookOpen,
  ChevronDown,
  Gavel,
  Globe,
  Languages,
  Loader2,
  Menu,
  Search,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

const MAX_CHARS = 300;
const MIN_CHARS = 10;
const TERMINAL: AgentStatus[] = ["done", "stopped", "error"];

const PROVIDERS: { value: NavigatorProvider; label: string }[] = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave" },
];
const LANGUAGES: { value: SearchLanguage; label: string; short: string }[] = [
  { value: "pt-BR", label: "Português", short: "PT" },
  { value: "en-US", label: "English", short: "EN" },
];
const POST_SIZES: { value: PostSize; icon: LucideIcon }[] = [
  { value: "small", icon: AlignLeft },
  { value: "medium", icon: Menu },
  { value: "large", icon: BookOpen },
];

function stoppedMessage(reason: StoppedReason | undefined): string {
  switch (reason) {
    case "no_research_results":
      return "A pesquisa não encontrou fontes para esse tópico. Tente um tópico diferente ou mais específico.";
    case "user_cancel":
      return "Execução cancelada.";
    default:
      return "Execução encerrada sem publicar.";
  }
}

export function CriarPostView() {
  const [topic, setTopic] = React.useState("");
  const [provider, setProvider] = React.useState<NavigatorProvider>("tavily");
  const [language, setLanguage] = React.useState<SearchLanguage>("pt-BR");
  const [postSize, setPostSize] = React.useState<PostSize>("small");
  // Condição do estudo desta execução. Inicia no default global (/agentes) e é
  // sobreposta por run — o estudo precisa rodar o MESMO tópico nas duas
  // condições, e ir mexer na config global entre um run e outro é o caminho
  // curto para gravar a condição errada no dataset.
  const [judgeLoop, setJudgeLoop] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [liveStatus, setLiveStatus] = React.useState<AgentStatus>("idle");
  const [artifacts, setArtifacts] = React.useState<ThreadArtifacts | null>(null);
  const esRef = React.useRef<EventSource | null>(null);

  const charCount = topic.length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;
  const started = threadId !== null;

  // Espelha o default global de /agentes na primeira carga, para o botão não
  // dizer "com judge" enquanto a config diz o contrário. Falha silenciosa:
  // mantém o default true.
  React.useEffect(() => {
    fetch("/api/mas/agent-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { agents?: { judge?: { enabled?: boolean } } }) => {
        if (typeof d.agents?.judge?.enabled === "boolean") {
          setJudgeLoop(d.agents.judge.enabled);
        }
      })
      .catch(() => {});
  }, []);

  // Busca artefatos quando o status muda (cada agente que termina adiciona campos).
  React.useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mas/state/${threadId}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as ThreadArtifacts;
        if (cancelled) return;
        setArtifacts({
          researchResults: d.researchResults ?? [],
          insights: d.insights ?? [],
          draft: d.draft ?? "",
          judgement: d.judgement ?? null,
          humanFeedback: d.humanFeedback ?? null,
          revisionCount: d.revisionCount ?? 0,
          judgeRetries: d.judgeRetries ?? 0,
          stoppedReason: d.stoppedReason ?? null,
          postSize: d.postSize ?? "medium",
          finalPostUrl: d.finalPostUrl ?? null,
        });
      } catch {
        // mantém
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, liveStatus]);

  // SSE do thread criado.
  React.useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    if (!threadId) return;

    const es = new EventSource(`/api/mas/stream/${threadId}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as StatusEvent;
        setLiveStatus(event.type);
        if (TERMINAL.includes(event.type)) {
          es.close();
          esRef.current = null;
          // Terminou: toast + reabre o form (threadId=null → campos reabilitam).
          // Ex.: 0 insights → error; tópico sem fontes → stopped (ambos amarelos).
          if (event.type === "error") {
            toast.warning(
              event.payload?.error ??
                "Não foi possível gerar o post para esse tópico. Tente outro.",
            );
            setThreadId(null);
          } else if (event.type === "stopped") {
            toast.warning(stoppedMessage(event.payload?.stoppedReason));
            setThreadId(null);
          } else if (event.type === "done") {
            toast.success("Post finalizado. Veja em Posts.");
            setThreadId(null);
          }
        }
      } catch {
        // ignora
      }
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [threadId]);

  async function handleSearch() {
    if (!isValid || submitting || started) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/mas/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          navigatorProvider: provider,
          language,
          postSize,
          judgeLoop,
        }),
      });
      const data = (await res.json()) as { threadId?: string; error?: string };
      if (!res.ok || !data.threadId) {
        toast.error(data.error ?? "Falha ao iniciar execução");
        setSubmitting(false);
        return;
      }
      window.dispatchEvent(
        new CustomEvent("mas:thread-created", { detail: { threadId: data.threadId } }),
      );
      setThreadId(data.threadId);
      setLiveStatus("researching");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro de rede");
    } finally {
      setSubmitting(false);
    }
  }

  const currentLang = LANGUAGES.find((l) => l.value === language)!;
  const CurrentSizeIcon = POST_SIZES.find((s) => s.value === postSize)!.icon;

  return (
    <div className="grid grid-cols-[1fr_380px] gap-3.5 max-[1100px]:grid-cols-1">
      {/* Formulário */}
      <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-5 py-4">
          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
            Novo post
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* judge on/off — condição do estudo (com_judge / sem_judge) */}
            <button
              type="button"
              disabled={started}
              onClick={() => setJudgeLoop((v) => !v)}
              aria-pressed={judgeLoop}
              title={
                judgeLoop
                  ? "Judge ligado: pontua e reescreve o draft até score ≥ 7 (condição com_judge)"
                  : "Judge desligado: ainda pontua uma vez para o estudo, mas não reescreve (condição sem_judge)"
              }
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors focus:outline-none disabled:opacity-50 ${
                judgeLoop
                  ? "border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20"
                  : "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/20"
              }`}
            >
              <Gavel size={12} />
              {judgeLoop ? "com judge" : "sem judge"}
            </button>

            {/* provider */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={started}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none disabled:opacity-50"
                >
                  <Globe size={12} className="text-[var(--accent-purple)]" />
                  {PROVIDERS.find((p) => p.value === provider)?.label}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[130px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Pesquisa web
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PROVIDERS.map((p) => (
                  <DropdownMenuItem key={p.value} onSelect={() => setProvider(p.value)}>
                    <Globe size={12} /> {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* idioma */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={started}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none disabled:opacity-50"
                >
                  <Languages size={12} className="text-[var(--accent-purple)]" />
                  {currentLang.short}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Idioma
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LANGUAGES.map((l) => (
                  <DropdownMenuItem key={l.value} onSelect={() => setLanguage(l.value)}>
                    <Languages size={12} /> {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* tamanho */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={started}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none disabled:opacity-50"
                >
                  <CurrentSizeIcon size={12} className="text-[var(--accent-purple)]" />
                  {POST_SIZE_RANGES[postSize].label}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Tamanho do post
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {POST_SIZES.map((s) => {
                  const range = POST_SIZE_RANGES[s.value];
                  const Icon = s.icon;
                  return (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => setPostSize(s.value)}
                      className="flex items-start gap-1.5"
                    >
                      <Icon size={12} className="mt-0.5" />
                      <span className="flex flex-col gap-0.5">
                        <span>{range.label}</span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          ~{range.min}-{range.max} chars · {range.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tópico ou contexto
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHARS))}
              rows={6}
              disabled={started}
              placeholder="Ex: O impacto da IA generativa nas equipes de produto em 2025..."
              className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]/40 disabled:opacity-60"
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

          {!judgeLoop && !started && (
            <div className="rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] px-3.5 py-2.5 text-[11px] text-[var(--accent-amber)]">
              Condição <span className="font-mono">sem_judge</span>: o Judge ainda
              pontua o draft (a nota entra no estudo), mas não devolve para reescrita —
              o post vai direto para a revisão humana.
            </div>
          )}

          {!started ? (
            <Button
              color="purple"
              onClick={handleSearch}
              disabled={!isValid || submitting}
              className="h-10 text-[13px] font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Iniciando...
                </>
              ) : (
                <>
                  <Search size={14} /> Pesquisar
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 text-[12px] text-[var(--text-secondary)]">
              {!TERMINAL.includes(liveStatus) && (
                <Loader2 size={13} className="animate-spin text-[var(--accent-purple)]" />
              )}
              Pipeline em andamento — acompanhe ao lado.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline */}
      <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
            Pipeline dos agentes
          </CardTitle>
        </CardHeader>
        <CardContent className="relative p-0">
          <div className={started ? "" : "pointer-events-none opacity-40"}>
            <PipelineVertical
              currentStatus={started ? liveStatus : "idle"}
              artifacts={started ? artifacts : null}
              className="max-h-[520px]"
            />
          </div>
          {!started && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] shadow-sm">
                Clique em “Pesquisar” para iniciar
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {started && liveStatus === "awaiting_review" && artifacts && (
        <ReviewPopup threadId={threadId!} topic={topic} artifacts={artifacts} />
      )}
    </div>
  );
}
