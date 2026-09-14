"use client";

import { MAX_JUDGE_RETRIES, MAX_REVISIONS } from "@/app/MAS/constants";
import {
  DraftVersionSummary,
  JudgeResult,
  HumanFeedback,
  ResearchResult,
} from "@/app/MAS/types/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink } from "lucide-react";
import {
  AgentDef,
  ArtifactKey,
  NodeState,
  ThreadArtifacts,
  hasArtifact,
} from "./pipeline-agents";

interface Props {
  agent: AgentDef;
  state: NodeState;
  artifacts: ThreadArtifacts | null;
}

export function AgentArtifactButton({ agent, state, artifacts }: Props) {
  if (state !== "done") return null;
  if (!agent.artifact) return null;
  if (!hasArtifact(agent, artifacts)) return null;

  const value = artifacts![agent.artifact.key];

  return (
    <Popover>
      <PopoverTrigger
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="nodrag nopan inline-flex h-5 cursor-pointer items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--bg-card)] px-1 font-mono text-[6px] font-medium uppercase tracking-[0.5px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] aria-expanded:bg-[var(--bg-card-hover)]"
      >
        {agent.artifact.label}
      </PopoverTrigger>
      <PopoverContent className="nodrag nopan nowheel">
        <ArtifactRenderer
          artifactKey={agent.artifact.key}
          value={value}
          artifacts={artifacts}
        />
      </PopoverContent>
    </Popover>
  );
}

interface RendererProps {
  artifactKey: ArtifactKey;
  value: ThreadArtifacts[ArtifactKey];
  artifacts: ThreadArtifacts | null;
}

function ArtifactRenderer({ artifactKey, value, artifacts }: RendererProps) {
  switch (artifactKey) {
    case "researchResults":
      return <ResearchList items={value as ResearchResult[]} />;
    case "insights":
      return <InsightsList items={value as string[]} />;
    case "draft":
      return <DraftView text={value as string} />;
    case "judgement":
      return (
        <JudgementView
          judgement={value as JudgeResult | null}
          versions={artifacts?.versions ?? []}
        />
      );
    case "humanFeedback":
      return <FeedbackView feedback={value as HumanFeedback | null} />;
    case "finalPostUrl":
      return <PostLink url={value as string | null} />;
    default:
      return null;
  }
}

function ResearchList({ items }: { items: ResearchResult[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Tópicos pesquisados
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li
            key={r.url}
            className="flex flex-col gap-0.5 rounded-md border border-[var(--border-subtle)] p-2"
          >
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 text-xs font-medium text-[var(--text-primary)] hover:underline"
            >
              {r.title}
            </a>
            <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
              {r.url}
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              relevância: {r.relevanceScore.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightsList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Insights extraídos
      </h4>
      <ol className="flex flex-col gap-2 pl-4 [counter-reset:item]">
        {items.map((insight, i) => (
          <li
            key={i}
            className="text-xs leading-snug text-[var(--text-secondary)] [&::marker]:text-[var(--text-muted)]"
          >
            {insight}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DraftView({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Rascunho
      </h4>
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
        {text}
      </pre>
    </div>
  );
}

const TRIGGER_LABEL: Record<DraftVersionSummary["trigger"], string> = {
  initial: "inicial",
  judge_retry: "reescrita do judge",
  human_revision: "revisão humana",
};

/**
 * O placar do loop judge ↔ writer.
 *
 * Existia o buraco de a crítica não dizer se houve loop: lendo só as notas, um
 * ACCEPT de primeira e um ACCEPT depois de três reescritas eram indistinguíveis
 * na tela — e a diferença entre os dois é o objeto do estudo. Cada linha é uma
 * versão gravada em `draft_versions`, com a nota atrelada àquela versão.
 */
function LoopHistory({ versions }: { versions: DraftVersionSummary[] }) {
  const retries = versions.filter((v) => v.trigger === "judge_retry").length;
  const humanas = versions.filter((v) => v.trigger === "human_revision").length;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border-subtle)] p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
          Loop do judge
        </span>
        <span
          className={`font-mono text-[10px] ${
            retries === 0
              ? "text-[var(--text-muted)]"
              : retries >= MAX_JUDGE_RETRIES
                ? "text-[var(--accent-red)]"
                : "text-[var(--accent-amber)]"
          }`}
        >
          {retries === 0
            ? "aprovado de primeira — nenhuma reescrita pedida"
            : `${retries} de ${MAX_JUDGE_RETRIES} reescritas${
                retries >= MAX_JUDGE_RETRIES ? " — teto, decisão humana" : ""
              }`}
        </span>
        {humanas > 0 && (
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            · {humanas}/{MAX_REVISIONS} revisões humanas
          </span>
        )}
      </div>

      {versions.length > 0 && (
        <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-x-2">
              <span className="text-[var(--text-primary)]">v{v.version}</span>
              <span className="text-[var(--text-muted)]">
                {TRIGGER_LABEL[v.trigger]}
              </span>
              <span className="text-[var(--text-muted)]">{v.charCount} ch</span>
              {v.overall !== null && <span>{v.overall}/5</span>}
              {v.decision && (
                <span
                  className={
                    v.decision === "ACCEPT"
                      ? "text-[var(--accent-green)]"
                      : "text-[var(--accent-red)]"
                  }
                >
                  {v.decision}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JudgementView({
  judgement,
  versions,
}: {
  judgement: JudgeResult | null;
  versions: DraftVersionSummary[];
}) {
  if (!judgement) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Crítica
      </h4>
      <LoopHistory versions={versions} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--text-secondary)]">
        <span
          className={
            judgement.decision === "ACCEPT"
              ? "text-[var(--accent-green)]"
              : "text-[var(--accent-red)]"
          }
        >
          {judgement.decision}
        </span>
        <span>geral {judgement.overall}/5</span>
        <span>clareza {judgement.clarity}/5</span>
        <span>relevância {judgement.relevance}/5</span>
        <span>profissional {judgement.professional}/5</span>
        <span>engajamento {judgement.engagement}/5</span>
      </div>
      {(judgement.hasEngagementBait ||
        judgement.hasExternalLinkInBody ||
        !judgement.lengthOk) && (
        <div className="flex flex-wrap gap-1 font-mono text-[10px] text-[var(--accent-amber)]">
          {judgement.hasEngagementBait && <span>⚠ engagement bait</span>}
          {judgement.hasExternalLinkInBody && <span>⚠ link no corpo</span>}
          {!judgement.lengthOk && <span>⚠ fora da faixa de chars</span>}
        </div>
      )}
      {judgement.issues.length > 0 && (
        <Section title="Problemas" items={judgement.issues} />
      )}
      {judgement.suggestions.length > 0 && (
        <Section title="Sugestões" items={judgement.suggestions} />
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
        {title}
      </span>
      <ul className="flex flex-col gap-1 pl-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="list-disc text-xs text-[var(--text-secondary)]"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackView({ feedback }: { feedback: HumanFeedback | null }) {
  if (!feedback) return null;
  return (
    <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Feedback humano
      </h4>
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span
          className={
            feedback.decision === "approve"
              ? "text-[var(--accent-green)]"
              : "text-[var(--accent-red)]"
          }
        >
          {feedback.decision}
        </span>
        <span className="text-[var(--text-muted)]">
          {new Date(feedback.timestamp).toLocaleString("pt-BR")}
        </span>
      </div>
      {feedback.comments && <p>{feedback.comments}</p>}
    </div>
  );
}

function PostLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Post publicado
      </h4>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[var(--accent-purple)] hover:underline"
      >
        <ExternalLink size={12} />
        {url}
      </a>
    </div>
  );
}
