"use client";

import { ACCEPT_MIN, RUBRIC_DIMENSIONS } from "@/app/MAS/lib/rubric";
import type { CorpusItem, CorpusStats } from "@/app/MAS/lib/studyCorpus";
import { StudyFormPanel } from "@/components/dashboard/study-form-panel";
import { AlertTriangle } from "lucide-react";
import * as React from "react";

// Corpus do estudo do gate — o artefato do desenho VIGENTE.
//
// Uma linha por post: a v1 de cada execução, com a nota do Judge e o rótulo cego
// que o avaliador humano vê. A tabela de pares antes/depois continua na página,
// abaixo, como material de mecanismo do desenho anterior.

interface Payload {
  items: CorpusItem[];
  stats: CorpusStats;
}

const EXCLUSION_LABEL: Record<string, string> = {
  run_descartado: "execução descartada do estudo",
  sem_versao: "sem draft gravado",
  sem_nota: "v1 sem nota do Judge",
  instrumento_v1: "nota na rubrica antiga (0–10) — incomparável com o form",
  topico_repetido: "já há uma execução mais antiga do mesmo tópico",
  acima_do_teto: "elegível, mas o corpus já está cheio",
};

export function CorpusPanel() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [verFora, setVerFora] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/mas/export/corpus")
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => setError("Falha ao carregar o corpus"));
  }, []);

  const stats = data?.stats;
  const dentro = React.useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => i.inCorpus)
        .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
    [data],
  );
  const fora = React.useMemo(
    () => (data?.items ?? []).filter((i) => !i.inCorpus),
    [data],
  );

  const acao =
    "rounded-lg border border-[var(--border-active)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]";

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Corpus: o Judge é um gate de qualidade confiável?
          </h2>
          <p className="max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">
            Cada execução entra com <strong>um</strong> post: o{" "}
            <strong>primeiro draft</strong>, que é o que o Judge viu antes de
            qualquer reescrita. Ele recebe uma nota do Judge e{" "}
            <strong>{stats?.raters ?? 3} notas humanas independentes</strong> no
            mesmo instrumento — e é a divergência entre as duas que o estudo mede.
            As versões reescritas ficam de fora de propósito: são produto de
            “reescreve até este juiz aprovar”, e enviesariam o corpus para ACCEPT.
          </p>
        </div>
        <StudyFormPanel />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Posts no corpus"
          value={stats ? `${stats.corpus}/${stats.maxPosts}` : "—"}
          hint={
            stats
              ? `${stats.topicos} tópicos distintos · um post por execução, um por tópico.`
              : "—"
          }
        />
        <Stat
          label="Aceitos pelo Judge"
          value={stats ? `${stats.accept} / ${stats.reject}` : "—"}
          hint="ACCEPT / REJECT no corpus. É o eixo do avaliador automático na matriz de confusão."
          tone="text-[var(--text-secondary)]"
        />
        <Stat
          label="Equilíbrio"
          value={
            stats?.balance != null ? `${Math.round(stats.balance * 100)}%` : "—"
          }
          hint="Fração da classe minoritária. Baixo demais e a matriz de confusão degenera — κ fica instável."
          tone={
            stats?.balanceWarning
              ? "text-[var(--accent-red)]"
              : "text-[var(--accent-green)]"
          }
        />
        <Stat
          label="Avaliações esperadas"
          value={String(stats?.avaliacoesEsperadas ?? 0)}
          hint={`${stats?.corpus ?? 0} posts × ${stats?.raters ?? 3} avaliadores. Cada post precisa das ${stats?.raters ?? 3} para render mediana.`}
          tone="text-[var(--text-secondary)]"
        />
      </div>

      {stats?.balanceWarning && stats.corpus > 0 && (
        <Aviso>
          O corpus está desequilibrado: <strong>{stats.accept} ACCEPT</strong> e{" "}
          <strong>{stats.reject} REJECT</strong>. Com uma das classes quase
          vazia, a matriz de confusão perde as células que interessam — em
          especial o <strong>falso-aceite</strong>, que é o achado que o estudo
          persegue. A saída é <strong>gerar mais execuções</strong>, com tópicos
          mais variados ou mais difíceis. Escolher a dedo quais posts entram
          resolveria o número e estragaria a estimativa: a amostra deixaria de
          ser cega à nota do Judge, e a taxa de falso-aceite pararia de estimar a
          taxa de produção.
        </Aviso>
      )}

      {stats != null && stats.excluded.instrumento_v1 > 0 && (
        <Aviso>
          <strong>{stats.excluded.instrumento_v1}</strong>{" "}
          {stats.excluded.instrumento_v1 === 1 ? "execução ficou" : "execuções ficaram"}{" "}
          de fora por ter nota na <strong>rubrica antiga (0–10)</strong>. Notas
          nessa escala não são comparáveis com respostas humanas em 1–5 — e
          misturá-las não dispara erro nenhum, só produz correlação sem
          significado. Para trazer essas execuções, é preciso re-pontuar os
          drafts no instrumento vigente.
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a href="/api/mas/export/corpus?format=posts" className={acao} target="_blank">
          Textos do formulário
        </a>
        <a href="/api/mas/export/instrument?format=md" className={acao}>
          Instrumento (.md)
        </a>
        <a href="/api/mas/export/corpus?format=mapping" className={acao}>
          Mapping (.csv)
        </a>
        <a href="/api/mas/export/corpus?format=xlsx" className={acao}>
          Corpus (.xlsx)
        </a>
        <a href="/api/mas/export/corpus?format=csv" className={acao}>
          Corpus (.csv)
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
              <th className="px-3 py-2.5 font-medium">Post</th>
              <th className="px-3 py-2.5 font-medium">Tópico</th>
              <th className="px-3 py-2.5 text-center font-medium">Gate</th>
              {RUBRIC_DIMENSIONS.map((d) => (
                <th key={d.key} className="px-3 py-2.5 text-center font-medium">
                  {d.label.split(" ")[0]}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-medium">Geral</th>
              <th className="px-3 py-2.5 text-center font-medium">Chars</th>
            </tr>
          </thead>
          <tbody>
            {dentro.length ? (
              dentro.map((i) => (
                <tr
                  key={i.versionId}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]"
                >
                  <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">
                    {i.label}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                    <span className="line-clamp-1 max-w-[260px]">{i.topic}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <DecisionBadge decision={i.judgement?.decision} />
                  </td>
                  {RUBRIC_DIMENSIONS.map((d) => (
                    <td key={d.key} className="px-3 py-2.5 text-center">
                      <ScoreCell value={i.judgement?.[d.key]} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <ScoreCell value={i.judgement?.overall} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-muted)]">
                    {i.charCount}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={RUBRIC_DIMENSIONS.length + 5}
                  className="px-3 py-6 text-center text-[var(--text-muted)]"
                >
                  Nenhum post elegível ainda — o corpus precisa de execuções com
                  a v1 avaliada no instrumento vigente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {fora.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setVerFora((v) => !v)}
            className="self-start text-[12px] text-[var(--text-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {verFora ? "Ocultar" : "Ver"} as {fora.length} execuções fora do
            corpus e o motivo
          </button>
          {verFora && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] p-4">
              {fora.map((i) => (
                <div
                  key={i.threadId}
                  className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]"
                >
                  <span className="line-clamp-1 max-w-[280px] text-[var(--text-secondary)]">
                    {i.topic}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    — {EXCLUSION_LABEL[i.exclusion ?? ""] ?? i.exclusion}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
      <AlertTriangle
        size={15}
        className="mt-0.5 shrink-0 text-[var(--accent-amber)]"
      />
      <p>{children}</p>
    </div>
  );
}

function DecisionBadge({ decision }: { decision?: string }) {
  if (!decision) return <span className="text-[var(--text-muted)]">—</span>;
  const accept = decision === "ACCEPT";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
        accept
          ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
          : "border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] text-[var(--accent-red)]"
      }`}
    >
      {decision}
    </span>
  );
}

/** Escala 1–5: o corte do verde é ACCEPT_MIN — o PISO da regra, não o gate (composto ponderado). */
function ScoreCell({ value }: { value: number | undefined }) {
  if (value == null) return <span className="text-[var(--text-muted)]">—</span>;
  const tone =
    value >= ACCEPT_MIN + 1
      ? "text-[var(--accent-green)]"
      : value >= ACCEPT_MIN
        ? "text-[var(--accent-amber)]"
        : "text-[var(--accent-red)]";
  return <span className={`font-mono tabular-nums ${tone}`}>{value}</span>;
}

function Stat({
  label,
  value,
  hint,
  tone = "text-[var(--text-primary)]",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className={`mt-1 text-[24px] font-semibold ${tone}`}>{value}</div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
        {hint}
      </p>
    </div>
  );
}
