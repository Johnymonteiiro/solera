"use client";

import { POST_SIZE_RANGES } from "@/app/MAS/constants";
import { AgentStatus, PostSize } from "@/app/MAS/types/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineVertical } from "@/components/dashboard/pipeline-vertical";
import { ThreadArtifacts } from "@/components/dashboard/pipeline-agents";
import { ReviewPopup } from "@/components/dashboard/review-popup";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { STATUS_LABEL, STATUS_TONE, formatDateTime } from "./_executions-shared";

interface PostMeta {
  threadId: string;
  topic: string;
  postSize: PostSize;
  status: AgentStatus;
  createdAt: string | null;
  completedAt: string | null;
  judgeLoop: boolean;
  draft: string;
  published: boolean;
  publishedAt: string | null;
  finalPostUrl: string | null;
}

const POLL_MS = 5000;
const TERMINAL: AgentStatus[] = ["done", "stopped", "error"];

export function PostDetail({ threadId }: { threadId: string }) {
  const [meta, setMeta] = React.useState<PostMeta | null>(null);
  const [artifacts, setArtifacts] = React.useState<ThreadArtifacts | null>(null);
  const [status, setStatus] = React.useState<AgentStatus>("idle");
  const [notFound, setNotFound] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        fetch(`/api/mas/posts/${threadId}`, { cache: "no-store" }),
        fetch(`/api/mas/state/${threadId}`, { cache: "no-store" }),
      ]);
      if (mRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (mRes.ok) {
        const m = (await mRes.json()) as PostMeta;
        setMeta(m);
        setStatus(m.status);
      }
      if (sRes.ok) {
        const s = (await sRes.json()) as ThreadArtifacts & { status: AgentStatus };
        setArtifacts({
          researchResults: s.researchResults ?? [],
          insights: s.insights ?? [],
          draft: s.draft ?? "",
          judgement: s.judgement ?? null,
          humanFeedback: s.humanFeedback ?? null,
          revisionCount: s.revisionCount ?? 0,
          judgeRetries: s.judgeRetries ?? 0,
          stoppedReason: s.stoppedReason ?? null,
          postSize: s.postSize ?? "medium",
          finalPostUrl: s.finalPostUrl ?? null,
        });
        setStatus(s.status ?? "idle");
      }
    } catch {
      // mantém valor anterior
    }
  }, [threadId]);

  React.useEffect(() => {
    load();
    // Poll enquanto não terminar (para acompanhar execuções ao vivo).
    const interval = setInterval(() => {
      setStatus((cur) => {
        if (!TERMINAL.includes(cur)) void load();
        return cur;
      });
    }, POLL_MS);
    const handler = () => void load();
    window.addEventListener("mas:refresh", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("mas:refresh", handler);
    };
  }, [load]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <p className="text-sm text-[var(--text-primary)]">Post não encontrado.</p>
        <Link href="/posts" className="text-[12px] text-[var(--accent-purple)] hover:underline">
          ← Voltar para Posts
        </Link>
      </div>
    );
  }

  const draft = meta?.draft || artifacts?.draft || "";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/posts"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} /> Voltar para Posts
      </Link>

      {/* Cabeçalho com badges/datas */}
      <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {meta?.published ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] px-2.5 py-0.5 text-[12px] text-[var(--accent-green)]">
                <CheckCircle2 size={13} /> Publicado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2.5 py-0.5 text-[12px] text-[var(--text-muted)]">
                <Circle size={13} /> Não publicado
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                status && STATUS_TONE[status],
              )}
            >
              {STATUS_LABEL[status]}
            </span>
            {meta && (
              <span className="rounded-md border border-[var(--border-active)]/60 bg-[var(--bg-input)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--text-secondary)]">
                {POST_SIZE_RANGES[meta.postSize].label}
              </span>
            )}
          </div>
          <CardTitle className="text-[15px] font-semibold text-[var(--text-primary)]">
            {meta?.topic || "sem tópico"}
          </CardTitle>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-[var(--text-muted)]">
            <span>criado: {meta?.createdAt ? formatDateTime(meta.createdAt) : "—"}</span>
            <span>
              publicado:{" "}
              {meta?.publishedAt ? formatDateTime(meta.publishedAt) : "—"}
            </span>
            <span>thread: {threadId}</span>
          </div>
          {meta?.finalPostUrl && (
            <a
              href={meta.finalPostUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--border-active)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent-purple)] transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              <ExternalLink size={13} /> Ver no LinkedIn
            </a>
          )}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-[1fr_360px] gap-4 max-[1000px]:grid-cols-1">
        {/* Rascunho */}
        <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
          <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Conteúdo do post
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-4">
            {draft ? (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {draft}
              </pre>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">
                Rascunho ainda não gerado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline / artefatos por agente */}
        <Card className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
          <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Pipeline dos agentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PipelineVertical
              currentStatus={status}
              artifacts={artifacts}
              className="max-h-[520px]"
            />
          </CardContent>
        </Card>
      </div>

      {status === "awaiting_review" && meta && artifacts && (
        <ReviewPopup
          threadId={threadId}
          topic={meta.topic}
          artifacts={artifacts}
        />
      )}
    </div>
  );
}
