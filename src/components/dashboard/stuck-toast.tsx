"use client";

import { MAX_JUDGE_RETRIES } from "@/app/MAS/constants";
import { AgentStatus } from "@/app/MAS/types/types";
import * as React from "react";
import { toast } from "sonner";
import { ThreadArtifacts } from "./pipeline-agents";

interface Props {
  threadId: string | null;
  topic: string;
  status: AgentStatus;
  artifacts: ThreadArtifacts | null;
}

const TERMINAL_DISMISS: AgentStatus[] = ["done", "error"];

// Toast unificado por threadId. Cobre 3 cenários:
// - awaiting_review normal → "Revisão pendente"
// - awaiting_review + judgeRetries >= MAX → "Pipeline travado" (stuck)
// - status === "stopped" + reason → "Tópico inválido" ou "Pipeline cancelado"
// Todos persistentes (duration: Infinity) — apenas o user fecha via X.
// Dedupe por chave (status + reason + stuck) pra evitar flicker do Strict Mode.
export function ReviewToast({ threadId, topic, status, artifacts }: Props) {
  const lastFiredRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!threadId) return;

    const label = topic || "(sem tópico)";
    const reason = artifacts?.stoppedReason ?? null;
    const retries = artifacts?.judgeRetries ?? 0;
    const score = artifacts?.judgement?.score ?? 0;
    const isStuck = status === "awaiting_review" && retries >= MAX_JUDGE_RETRIES;

    // Done/error: dismiss e sai
    if (TERMINAL_DISMISS.includes(status)) {
      toast.dismiss(threadId);
      lastFiredRef.current = null;
      return;
    }

    // Status irrelevante (idle, researching, etc): não toca em nada
    if (status !== "awaiting_review" && status !== "stopped") {
      return;
    }

    // Dedupe: se já firei o mesmo conteúdo, não re-disparar (evita flicker
    // de Strict Mode + re-renders por fetch de artifacts).
    const key = `${threadId}:${status}:${reason ?? ""}:${isStuck}`;
    if (lastFiredRef.current === key) return;
    lastFiredRef.current = key;

    if (status === "stopped") {
      if (reason === "no_research_results") {
        toast.warning(`Tópico inválido: ${label}`, {
          id: threadId,
          description:
            "Nenhum resultado de pesquisa encontrado — tente um tópico mais específico.",
          duration: Infinity,
          closeButton: true,
        });
      } else {
        toast.info(`Pipeline cancelado: ${label}`, {
          id: threadId,
          duration: Infinity,
          closeButton: true,
        });
      }
      return;
    }

    // status === "awaiting_review"
    if (isStuck) {
      toast.warning(`Pipeline travado: ${label}`, {
        id: threadId,
        description: `Score ${score.toFixed(1)} após ${retries} tentativas. Abra a revisão para decidir.`,
        duration: Infinity,
        closeButton: true,
      });
    } else {
      toast.info(`Revisão pendente: ${label}`, {
        id: threadId,
        description: `Score ${score.toFixed(1)} — abra o popup para aprovar, revisar ou cancelar.`,
        duration: Infinity,
        closeButton: true,
      });
    }
  }, [threadId, topic, status, artifacts]);

  return null;
}

// Backwards-compat alias — os call sites importam como StuckToast.
export const StuckToast = ReviewToast;
