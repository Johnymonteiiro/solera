"use client";

import {
  MAX_JUDGE_RETRIES,
  MAX_REVISIONS,
  POST_SIZE_RANGES,
} from "@/app/MAS/constants";
import { ACCEPT_MIN } from "@/app/MAS/lib/rubric";
import {
  AgentStatus,
  JudgeResult,
  NavigatorProvider,
  PostSize,
  SearchLanguage,
  StatusEvent,
  StoppedReason,
} from "@/app/MAS/types/types";
import { ThreadArtifacts } from "@/components/dashboard/pipeline-agents";
import { PipelineVertical } from "@/components/dashboard/pipeline-vertical";
import { ReviewActions } from "@/components/dashboard/review-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE } from "./_executions-shared";
import {
  AlertTriangle,
  AlignLeft,
  BookOpen,
  ChevronDown,
  Gavel,
  Globe,
  Languages,
  Loader2,
  Menu,
  Plus,
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

// ─── Estado partilhado entre o formulário, o header e o corpo ────────────────
//
// O formulário saiu do corpo da página e virou modal (2026-09-07): a tela agora
// é feita para ACOMPANHAR a execução — pipeline à esquerda, post à direita,
// estatísticas embaixo —, e o formulário é o gesto de disparo, não o conteúdo
// permanente. Antes ele ocupava metade da largura para sempre, inclusive depois
// de o post ficar pronto, que é quando ele não serve mais para nada.
//
// O contexto continua existindo pelo mesmo motivo de antes: a ação primária
// mora no header da página e o formulário no modal — são irmãos na árvore, e o
// estado que um habilita o outro consome.

interface CriarPostCtx {
  topic: string;
  setTopic: React.Dispatch<React.SetStateAction<string>>;
  provider: NavigatorProvider;
  setProvider: React.Dispatch<React.SetStateAction<NavigatorProvider>>;
  language: SearchLanguage;
  setLanguage: React.Dispatch<React.SetStateAction<SearchLanguage>>;
  postSize: PostSize;
  setPostSize: React.Dispatch<React.SetStateAction<PostSize>>;
  judgeLoop: boolean | null;
  setJudgeLoop: React.Dispatch<React.SetStateAction<boolean | null>>;
  submitting: boolean;
  liveStatus: AgentStatus;
  artifacts: ThreadArtifacts | null;
  threadId: string | null;
  charCount: number;
  isValid: boolean;
  started: boolean;
  formOpen: boolean;
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSearch: () => void;
}

const Ctx = React.createContext<CriarPostCtx | null>(null);

function useCriarPost(): CriarPostCtx {
  const v = React.useContext(Ctx);
  if (!v) {
    throw new Error(
      "CriarPostView e CriarPostAction precisam estar dentro de <CriarPostProvider>",
    );
  }
  return v;
}

export function CriarPostProvider({ children }: { children: React.ReactNode }) {
  const [topic, setTopic] = React.useState("");
  const [provider, setProvider] = React.useState<NavigatorProvider>("tavily");
  const [language, setLanguage] = React.useState<SearchLanguage>("pt-BR");
  const [postSize, setPostSize] = React.useState<PostSize>("small");
  // Condição do estudo desta execução. Inicia no default global (/agentes) e é
  // sobreposta por run — o estudo precisa rodar o MESMO tópico nas duas
  // condições, e ir mexer na config global entre um run e outro é o caminho
  // curto para gravar a condição errada no dataset.
  //
  // `null` = default global ainda não carregou. NÃO é o mesmo que `true`: nesse
  // estado o campo é OMITIDO do corpo e quem resolve a condição é a rota, com a
  // mesma config que o efeito abaixo leria. Sem isso, submeter na janela entre o
  // mount e a resposta do fetch gravava `judgeLoop=true` com a config dizendo o
  // contrário — a condição errada no dataset, sem erro nenhum aparecer.
  const [judgeLoop, setJudgeLoop] = React.useState<boolean | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);

  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [liveStatus, setLiveStatus] = React.useState<AgentStatus>("idle");
  const [artifacts, setArtifacts] = React.useState<ThreadArtifacts | null>(null);
  const esRef = React.useRef<EventSource | null>(null);

  const charCount = topic.length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;
  const started = threadId !== null;

  // Espelha o default global de /agentes na primeira carga, para o botão não
  // dizer "com judge" enquanto a config diz o contrário. Falha silenciosa:
  // segue `null`, e a rota resolve a condição pela config no servidor.
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
          versions: d.versions ?? [],
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
          // Omitido enquanto o default global não carregou — ver o estado.
          ...(judgeLoop !== null && { judgeLoop }),
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
      // Fecha só depois do aceite da rota: com erro, o modal continua aberto
      // com o tópico digitado, que é o que a pessoa precisa corrigir.
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro de rede");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Ctx.Provider
      value={{
        topic,
        setTopic,
        provider,
        setProvider,
        language,
        setLanguage,
        postSize,
        setPostSize,
        judgeLoop,
        setJudgeLoop,
        submitting,
        liveStatus,
        artifacts,
        threadId,
        charCount,
        isValid,
        started,
        formOpen,
        setFormOpen,
        handleSearch,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Ação primária da tela, renderizada no header de /posts/novo.
 *
 * Abre o modal do formulário — não dispara o pipeline. Quem dispara é o botão
 * do rodapé do modal, ao lado dos campos que ele valida; um botão que executa
 * ficando longe do formulário que ele lê foi o arranjo anterior, e ele obrigava
 * o formulário a ocupar metade da tela só para estar visível.
 *
 * Enquanto o pipeline roda ela vira um indicador em vez de sumir: um botão que
 * desaparece deixa o header sem explicar por que não dá mais para disparar.
 */
export function CriarPostAction() {
  const { started, setFormOpen } = useCriarPost();
  const phase = useRunPhase();

  if (started) {
    // O texto segue a fase pelo mesmo motivo do badge: "Em andamento" enquanto
    // a página inteira está âmbar pedindo decisão é o header contradizendo o
    // corpo, e quem lê acredita no header.
    const tone =
      phase === "stuck"
        ? "border-[var(--accent-red)]/40 bg-[var(--accent-red-dim)] text-[var(--accent-red)]"
        : phase === "review"
          ? "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)]";
    const label =
      phase === "stuck"
        ? "Pipeline travado"
        : phase === "review"
          ? "Revisão pendente"
          : "Em andamento";

    return (
      <span
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px]",
          tone,
        )}
      >
        {/* Sem spinner aqui: o único da tela é o do badge do card do post,
            ao lado do rótulo que diz QUAL etapa está rodando. Três animações
            dizendo "algo acontece" competem entre si e nenhuma informa. */}
        {(phase === "review" || phase === "stuck") && (
          <AlertTriangle size={13} />
        )}
        {label}
      </span>
    );
  }

  return (
    <Button
      color="purple"
      size="sm"
      onClick={() => setFormOpen(true)}
      className="h-8 text-[12px] font-medium"
    >
      <Plus size={14} /> Criar post
    </Button>
  );
}

// ─── Formulário (modal) ──────────────────────────────────────────────────────

function CriarPostDialog() {
  const {
    topic,
    setTopic,
    provider,
    setProvider,
    language,
    setLanguage,
    postSize,
    setPostSize,
    judgeLoop,
    setJudgeLoop,
    submitting,
    charCount,
    isValid,
    started,
    formOpen,
    setFormOpen,
    handleSearch,
  } = useCriarPost();

  const currentLang = LANGUAGES.find((l) => l.value === language)!;
  const CurrentSizeIcon = POST_SIZES.find((s) => s.value === postSize)!.icon;
  const chipClass =
    "flex items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus:outline-none disabled:opacity-50";

  return (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
        <DialogHeader className="mb-4 pr-6">
          <DialogTitle>Novo post</DialogTitle>
          <DialogDescription>
            O tópico e as condições desta execução. O pipeline começa a rodar
            assim que você confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* judge on/off — condição do estudo (com_judge / sem_judge) */}
            <button
              type="button"
              disabled={started || judgeLoop === null}
              onClick={() => setJudgeLoop((v) => !(v ?? true))}
              aria-pressed={judgeLoop ?? undefined}
              title={
                judgeLoop === null
                  ? "Carregando o default do Judge definido em /agentes…"
                  : judgeLoop
                    ? "Judge ligado: pontua e reescreve o draft até ACCEPT (todas as dimensões ≥ 3)"
                    : "Judge desligado: ainda pontua uma vez para o estudo, mas não reescreve (condição sem_judge)"
              }
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors focus:outline-none disabled:opacity-50 ${
                judgeLoop === null
                  ? "border-[var(--border-active)] bg-[var(--bg-input)] text-[var(--text-secondary)]"
                  : judgeLoop
                    ? "border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20"
                    : "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/20"
              }`}
            >
              {judgeLoop === null ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Gavel size={12} />
              )}
              {judgeLoop === null ? "judge" : judgeLoop ? "com judge" : "sem judge"}
            </button>

            {/* provider */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button disabled={started} className={chipClass}>
                  <Globe size={12} className="text-[var(--accent-purple)]" />
                  {PROVIDERS.find((p) => p.value === provider)?.label}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[130px]">
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

            {/* idioma — decide a língua do POST, não a da busca (lib/language.ts) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button disabled={started} className={chipClass}>
                  <Languages size={12} className="text-[var(--accent-purple)]" />
                  {currentLang.short}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                <DropdownMenuLabel className="text-[var(--text-muted)]">
                  Idioma do post
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
                <button disabled={started} className={chipClass}>
                  <CurrentSizeIcon size={12} className="text-[var(--accent-purple)]" />
                  {POST_SIZE_RANGES[postSize].label}
                  <ChevronDown size={11} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px]">
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

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tópico ou contexto
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHARS))}
              rows={5}
              autoFocus
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

          {judgeLoop === false && (
            <div className="rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] px-3.5 py-2.5 text-[11px] text-[var(--accent-amber)]">
              Condição <span className="font-mono">sem_judge</span>: o Judge ainda
              pontua o draft (a nota entra no estudo), mas não devolve para reescrita —
              o post vai direto para a revisão humana.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(false)}
              className="h-8 text-[12px]"
            >
              Cancelar
            </Button>
            <Button
              color="purple"
              size="sm"
              onClick={handleSearch}
              disabled={!isValid || submitting || started}
              title={
                isValid
                  ? undefined
                  : `Escreva o tópico (mínimo ${MIN_CHARS} caracteres) para liberar`
              }
              className="h-8 text-[12px] font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Iniciando...
                </>
              ) : (
                <>
                  <Search size={14} /> Criar post
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Estado da execução, em uma palavra ──────────────────────────────────────
//
// Uma fase só, derivada do status ao vivo, alimenta as três coisas que o popup
// de revisão fazia sozinho: a cor da faixa de estatísticas, o badge do header do
// post e a existência (ou não) dos botões de decisão. Derivar num lugar só é o
// que impede a faixa ficar âmbar enquanto o badge diz "publicado".

type RunPhase = "idle" | "running" | "review" | "stuck";

/**
 * Quantas reescritas o JUDGE pediu nesta execução.
 *
 * Sai do trigger das versões gravadas, não de `state.judgeRetries`: aquele
 * contador incrementa em toda passada do writer que já tinha nota — inclusive
 * as de revisão humana —, então 1 reescrita do judge + 2 revisões humanas
 * marcariam "teto atingido" sem o judge ter pedido três. O contador só entra
 * como reserva para execuções antigas, cujo histórico nunca foi gravado.
 */
function useJudgeRewrites(): number {
  const { artifacts } = useCriarPost();
  const versions = artifacts?.versions ?? [];
  if (!versions.length) return artifacts?.judgeRetries ?? 0;
  return versions.filter((v) => v.trigger === "judge_retry").length;
}

function useRunPhase(): RunPhase {
  const { started, liveStatus } = useCriarPost();
  const rewrites = useJudgeRewrites();
  if (!started) return "idle";
  if (liveStatus !== "awaiting_review") return "running";
  // Estourou o teto de reescritas automáticas: writer e judge não convergem
  // sozinhos, e insistir em "revisar" é repetir o caminho que já falhou.
  return rewrites >= MAX_JUDGE_RETRIES ? "stuck" : "review";
}

/**
 * Badge do header do card do post.
 *
 * Herda `STATUS_LABEL`/`STATUS_TONE`, a mesma tabela das listas de execução —
 * um segundo vocabulário de estado só para esta tela é como dois lugares
 * passam a discordar sobre o que "revisando" quer dizer. A única exceção é o
 * travamento, que não é um `AgentStatus`: ele se lê do contador de retries.
 */
function StatusBadge() {
  const { liveStatus, started } = useCriarPost();
  const phase = useRunPhase();
  const rewrites = useJudgeRewrites();
  if (!started) return null;

  const stuck = phase === "stuck";
  const label = stuck
    ? `travado após ${rewrites} reescritas`
    : STATUS_LABEL[liveStatus];
  const tone = stuck
    ? "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-[var(--accent-red)]/30"
    : STATUS_TONE[liveStatus];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {phase === "running" && !TERMINAL.includes(liveStatus) && (
        <Loader2 size={11} className="animate-spin" />
      )}
      {(phase === "review" || stuck) && <AlertTriangle size={11} />}
      {label}
    </span>
  );
}

// ─── Estatísticas ────────────────────────────────────────────────────────────

type StatTone = "default" | "muted" | "green" | "amber" | "red";

const STAT_TONE: Record<StatTone, string> = {
  default: "text-[var(--text-primary)]",
  muted: "text-[var(--text-muted)]",
  green: "text-[var(--accent-green)]",
  amber: "text-[var(--accent-amber)]",
  red: "text-[var(--accent-red)]",
};

/**
 * Cor de uma nota da rubrica v2 (escala 1–5).
 *
 * O corte do verde é `ACCEPT_MIN`, que hoje é o PISO da regra, não o gate
 * inteiro: verde é folga, âmbar é a nota no piso, vermelho é o que já está
 * abaixo dele. Quem decide ACCEPT/REJECT é o composto ponderado — a cor de uma
 * dimensão isolada não consegue contar essa história, e não deve fingir que
 * conta.
 */
function scoreTone(score: number): StatTone {
  if (score >= ACCEPT_MIN + 1) return "green";
  if (score >= ACCEPT_MIN) return "amber";
  return "red";
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div className="flex min-w-[70px] flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[16px] leading-none font-semibold tabular-nums",
          STAT_TONE[tone],
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="font-mono text-[10px] leading-none text-[var(--text-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * O que o pipeline produziu: fontes, insights e o tamanho do texto.
 *
 * Fica embaixo da coluna do pipeline porque é o placar DELE — cada número é a
 * saída de um nó da lista logo acima (researcher, analyst, writer). Do outro
 * lado ficam as notas do juiz, que são julgamento sobre o post, não produção.
 */
function PipelineStats() {
  const { artifacts, postSize, started } = useCriarPost();

  const draft = artifacts?.draft ?? "";
  const range = POST_SIZE_RANGES[postSize];
  const lengthTone: StatTone = !draft
    ? "muted"
    : draft.length < range.min || draft.length > range.max
      ? "amber"
      : "green";

  return (
    <Card
      size="sm"
      className="shrink-0 gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0"
    >
      <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-4 px-5">
        <Stat
          label="fontes"
          value={started ? String(artifacts?.researchResults.length ?? 0) : "—"}
          tone={started ? "default" : "muted"}
        />
        <Stat
          label="insights"
          value={started ? String(artifacts?.insights.length ?? 0) : "—"}
          tone={started ? "default" : "muted"}
        />
        <Stat
          label="caracteres"
          value={draft ? String(draft.length) : "—"}
          hint={`alvo ${range.min}-${range.max}`}
          tone={lengthTone}
        />
      </CardContent>
    </Card>
  );
}

const JUDGE_DIMS: {
  key: keyof Pick<
    JudgeResult,
    "clarity" | "relevance" | "professional" | "engagement"
  >;
  label: string;
}[] = [
  { key: "clarity", label: "clareza" },
  { key: "relevance", label: "relevân." },
  { key: "professional", label: "profis." },
  { key: "engagement", label: "engaj." },
];

/**
 * Faixa embaixo do post: a avaliação e a decisão humana, na mesma superfície.
 *
 * Ela troca de paleta com a fase — neutra enquanto roda, âmbar quando a revisão
 * está pendente, vermelha quando o loop travou. É a cor que antes vivia no
 * cabeçalho do popup; aqui ela pinta o lugar onde a pessoa vai clicar, que é o
 * ponto do qual o popup precisava chamar atenção.
 *
 * As notas aparecem por DIMENSÃO, não só a geral: a decisão do gate é "toda
 * dimensão ≥ 3", então a geral sozinha não explica um REJECT — e é exatamente a
 * dimensão reprovada que volta para o writer corrigir.
 */
function StatsBand() {
  const { artifacts, started, threadId } = useCriarPost();
  const phase = useRunPhase();

  const judgement = artifacts?.judgement ?? null;
  // 0 é sentinela de "ainda não avaliado" (a escala é 1–5), não nota.
  const scored = !!judgement && judgement.overall > 0;
  const needsDecision = phase === "review" || phase === "stuck";

  const versions = artifacts?.versions ?? [];
  const judgeRewrites = versions.filter((v) => v.trigger === "judge_retry").length;
  const humanRevisions = versions.filter(
    (v) => v.trigger === "human_revision",
  ).length;

  // A fase pinta só a BORDA. O fundo é `--bg-card` como o de todo card da
  // tela: tingir a superfície inteira fazia a faixa parecer outro componente,
  // e o que precisa saltar é a decisão pendente, não o painel.
  const bandBorder =
    phase === "stuck"
      ? "border-[var(--accent-red)]/50"
      : phase === "review"
        ? "border-[var(--accent-amber)]/50"
        : "border-[var(--border-subtle)]";

  return (
    <Card
      size="sm"
      className={cn(
        "shrink-0 gap-0 bg-[var(--bg-card)] ring-0",
        bandBorder,
      )}
    >
      <CardContent className="flex flex-col gap-3 px-5">
        <div className="flex flex-wrap items-start gap-x-7 gap-y-4">
          {JUDGE_DIMS.map((d) => (
            <Stat
              key={d.key}
              label={d.label}
              value={scored ? `${judgement![d.key]}/5` : "—"}
              tone={scored ? scoreTone(judgement![d.key]) : "muted"}
            />
          ))}
          <Stat
            label="geral"
            value={scored ? `${judgement!.overall}/5` : "—"}
            tone={scored ? scoreTone(judgement!.overall) : "muted"}
          />

          <div className="h-8 w-px self-center bg-[var(--border-subtle)]" />

          {/* Os dois loops, separados e com o mesmo teto de 3. Contados pelo
              TRIGGER das versões gravadas, não por `judgeRetries` — aquele
              contador incrementa também nas passadas de revisão humana, então
              ele responde "houve reescrita", nunca "quem pediu". */}
          <Stat
            label="reescritas"
            value={started ? String(judgeRewrites) : "—"}
            hint={`judge · de ${MAX_JUDGE_RETRIES}`}
            tone={
              !started
                ? "muted"
                : judgeRewrites >= MAX_JUDGE_RETRIES
                  ? "red"
                  : judgeRewrites > 0
                    ? "amber"
                    : "default"
            }
          />
          <Stat
            label="revisões"
            value={started ? String(humanRevisions) : "—"}
            hint={`humano · de ${MAX_REVISIONS}`}
            tone={
              !started
                ? "muted"
                : humanRevisions >= MAX_REVISIONS
                  ? "red"
                  : "default"
            }
          />

          {scored && (
            <span
              className={cn(
                "self-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium",
                judgement!.decision === "ACCEPT"
                  ? "border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                  : "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]",
              )}
            >
              {judgement!.decision}
            </span>
          )}

        </div>

        {needsDecision && threadId && artifacts && (
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <ReviewActions
              threadId={threadId}
              revisionCount={artifacts.revisionCount}
              isStuck={phase === "stuck"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── A tela ──────────────────────────────────────────────────────────────────

export function CriarPostView() {
  const { topic, liveStatus, artifacts, threadId, started, setFormOpen } =
    useCriarPost();

  // Chegou na tela sem execução em andamento: o formulário abre sozinho, porque
  // é para isso que se entra aqui. Guardado por ref e por `started` — e vale
  // registrar que sob Cache Components a página não desmonta ao navegar
  // (`<Activity>`), então este efeito NÃO re-dispara ao voltar; quem volta usa
  // o botão do header. Reabrir a cada retorno taparia o post que está na tela.
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (autoOpened.current || started) return;
    autoOpened.current = true;
    setFormOpen(true);
  }, [started, setFormOpen]);

  const draft = artifacts?.draft ?? "";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-3.5 max-[1100px]:grid-cols-1 max-[1100px]:overflow-y-auto">
      {/* Pipeline + o que ele produziu */}
      <div className="flex min-h-0 flex-col gap-3.5">
        <Card className="flex min-h-0 flex-1 flex-col gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
          <CardHeader className="shrink-0 border-b border-[var(--border-subtle)] px-5 py-4">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Pipeline dos agentes
            </CardTitle>
          </CardHeader>
          <CardContent className="relative min-h-0 flex-1 p-0">
            <div
              className={cn(
                "h-full",
                started ? "" : "pointer-events-none opacity-40",
              )}
            >
              <PipelineVertical
                currentStatus={started ? liveStatus : "idle"}
                artifacts={started ? artifacts : null}
                className="h-full max-[1100px]:max-h-[520px]"
              />
            </div>
            {!started && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-center text-[11px] text-[var(--text-muted)] shadow-sm">
                  Clique em “Criar post”, no topo da página, para iniciar
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <PipelineStats />
      </div>

      {/* Post + avaliação e decisão */}
      <div className="flex min-h-0 flex-col gap-3.5">
        <Card className="flex min-h-0 flex-1 flex-col gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                Post
              </CardTitle>
              {started && topic && (
                <span className="truncate text-[11px] text-[var(--text-muted)]">
                  {topic}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge />
              {threadId && (
                <span className="rounded-md border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                  {threadId}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {draft ? (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {draft}
              </pre>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                <p className="text-[13px] text-[var(--text-secondary)]">
                  {started
                    ? "O writer ainda não devolveu o rascunho."
                    : "Nenhum post nesta tela."}
                </p>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  {started
                    ? "Acompanhe o pipeline ao lado — o texto aparece aqui assim que existir."
                    : "Clique em “Criar post”, no topo, para escrever o tópico."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <StatsBand />
      </div>

      <CriarPostDialog />
    </div>
  );
}
