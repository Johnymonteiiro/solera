"use client";

import { MAX_REVISIONS } from "@/app/MAS/constants";
import { HumanDecision } from "@/app/MAS/types/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, RotateCcw, Send, X, XCircle } from "lucide-react";
import * as React from "react";

// ─── Ações da revisão humana ─────────────────────────────────────────────────
//
// Saíram do popup flutuante (`review-popup.tsx`) e passaram a viver na faixa de
// estatísticas de /posts/novo. O popup repetia, sobre a página, três coisas que
// a página já mostra — o rascunho, as notas do juiz e o tópico — e cobria a
// quarta, o pipeline. O que ele tinha de único eram estes botões.
//
// O componente é só a barra de ação: quem desenha o entorno (cor da faixa,
// badge de estado) é quem o embute, porque essa moldura é a mesma da
// estatística. Ver `StatsBand` em criar-post-view.tsx.
//
// O popup continua existindo para /posts/[threadId], que não tem faixa de
// estatística onde pendurar isto.

interface Props {
  threadId: string;
  /** Revisões humanas já gastas — trava o botão no teto de MAX_REVISIONS. */
  revisionCount: number;
  /**
   * Estourou MAX_JUDGE_RETRIES: o writer e o judge não convergem sozinhos.
   * Abre duas saídas a mais — refazer a pesquisa e encerrar sem publicar —,
   * porque insistir em "revisar" é o caminho que já falhou.
   */
  isStuck: boolean;
}

export function ReviewActions({ threadId, revisionCount, isStuck }: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [comments, setComments] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const noRevisionsLeft = revisionCount >= MAX_REVISIONS;

  const submit = async (decision: HumanDecision, requireComments = false) => {
    // Primeiro clique em "Revisar" abre o campo; o segundo envia. Reescrever
    // sem dizer o que mudar devolve o mesmo texto.
    if (requireComments && comments.trim().length === 0) {
      setShowRejectInput(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mas/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          decision,
          comments: requireComments ? comments.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Erro ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Em sucesso não mexe no estado local: o SSE muda o status e a faixa
      // inteira troca de cor e de conteúdo sozinha.
      setShowRejectInput(false);
      setComments("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2.5">
      {showRejectInput && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              O que precisa mudar?
            </label>
            <button
              onClick={() => {
                setShowRejectInput(false);
                setComments("");
              }}
              aria-label="Fechar campo de revisão"
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Instruções específicas para a reescrita — elas têm prioridade sobre as regras do writer."
            rows={2}
            autoFocus
            disabled={submitting}
            className="w-full resize-y rounded-md bg-[var(--bg-input)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)] outline-none placeholder:text-[var(--text-muted)] focus:ring-[var(--accent-purple)]"
          />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)]/50 px-2.5 py-1.5 text-[11px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="soft"
          color="green"
          size="sm"
          onClick={() => submit("approve")}
          disabled={submitting}
          className="h-8 text-[12px]"
        >
          <Send size={12} />
          Publicar
        </Button>
        <Button
          variant="soft"
          color="amber"
          size="sm"
          onClick={() => submit("reject", true)}
          disabled={submitting || noRevisionsLeft}
          title={
            noRevisionsLeft
              ? `Teto de ${MAX_REVISIONS} revisões humanas atingido`
              : undefined
          }
          className="h-8 text-[12px]"
        >
          <RotateCcw size={12} />
          {showRejectInput ? "Enviar revisão" : "Revisar"}
        </Button>
        {isStuck && (
          <Button
            variant="soft"
            color="purple"
            size="sm"
            onClick={() => submit("restart_research")}
            disabled={submitting}
            className="h-8 text-[12px]"
          >
            <RefreshCw size={12} />
            Refazer pesquisa
          </Button>
        )}
        <Button
          variant="soft"
          color="red"
          size="sm"
          onClick={() => submit("stop")}
          disabled={submitting}
          className="h-8 text-[12px]"
        >
          <XCircle size={12} />
          {isStuck ? "Encerrar" : "Cancelar"}
        </Button>

        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          rev {revisionCount}/{MAX_REVISIONS}
        </span>
      </div>
    </div>
  );
}
