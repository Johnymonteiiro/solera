"use client";

import {
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
        <ArtifactRenderer artifactKey={agent.artifact.key} value={value} />
      </PopoverContent>
    </Popover>
  );
}

interface RendererProps {
  artifactKey: ArtifactKey;
  value: ThreadArtifacts[ArtifactKey];
}

function ArtifactRenderer({ artifactKey, value }: RendererProps) {
  switch (artifactKey) {
    case "researchResults":
      return <ResearchList items={value as ResearchResult[]} />;
    case "insights":
      return <InsightsList items={value as string[]} />;
    case "draft":
      return <DraftView text={value as string} />;
    case "judgement":
      return <JudgementView judgement={value as JudgeResult | null} />;
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

function JudgementView({ judgement }: { judgement: JudgeResult | null }) {
  if (!judgement) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
        Crítica
      </h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--text-secondary)]">
        <span>score {judgement.score}/10</span>
        <span>hook {judgement.hookQuality}/10</span>
        <span>originalidade {judgement.originality}/10</span>
        <span>scannability {judgement.scannability}/10</span>
        <span>cta {judgement.ctaQuality}/10</span>
        <span>tom LinkedIn: {judgement.toneLinkedIn ? "ok" : "não"}</span>
      </div>
      {(judgement.hasEngagementBait || judgement.hasExternalLinkInBody) && (
        <div className="flex flex-wrap gap-1 font-mono text-[10px] text-[var(--accent-red)]">
          {judgement.hasEngagementBait && <span>⚠ engagement bait</span>}
          {judgement.hasExternalLinkInBody && <span>⚠ link no corpo</span>}
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
