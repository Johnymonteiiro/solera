"use client";

import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  DIMENSION_WEIGHTS,
  OVERALL_QUESTION,
  RUBRIC_DIMENSIONS,
  type RubricDimension,
} from "@/app/MAS/lib/rubric";
import type { CorpusArm, CorpusItem, CorpusStats } from "@/app/MAS/lib/studyCorpus";
import { StudyFormPanel } from "@/components/dashboard/study-form-panel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ChevronDown, ChevronRight, Download } from "lucide-react";
import * as React from "react";

// Página do estudo: o corpus do gate (rubrica v2), numa tabela só.
//
// Uma linha por execução: a v1, com a nota do Judge e o rótulo cego que o
// avaliador humano vê. O filtro de modelo troca o braço do benchmark; o de
// escopo mostra também quem ficou fora do corpus e por quê (antes era uma lista
// separada). A tabela de pares antes/depois saiu da página em 2026-09-17: com
// firstPassRate 100% ela estava sempre vazia. O dado continua em
// /api/mas/export/revision-pairs e em lib/revisionPairs.ts.

interface Payload {
  items: CorpusItem[];
  stats: CorpusStats;
  arm: string;
  arms: CorpusArm[];
}

const PAGE_SIZE = 10;

type Escopo = "corpus" | "todas";

/** "" é o corpus original (o que foi ao formulário); o resto é slug do OpenRouter. */
function armLabel(model: string): string {
  return model ? model : "GPT · corpus original";
}

const EXCLUSION_LABEL: Record<string, string> = {
  run_descartado: "execução descartada do estudo",
  sem_versao: "sem draft gravado",
  sem_nota: "v1 sem nota do Judge",
  instrumento_v1: "nota na rubrica antiga (0–10)",
  topico_repetido: "tópico repetido",
  acima_do_teto: "corpus já está cheio",
  fora_do_benchmark: "tópico fora do corpus original",
};

// Cabeçalhos com a pergunta da rubrica no tooltip. Os textos vêm de
// lib/rubric.ts, a fonte única do instrumento (o Judge lê as mesmas âncoras).
type NumericKey = RubricDimension | "overall";

const SHORT: Record<RubricDimension, string> = {
  clarity: "Clareza",
  relevance: "Relev.",
  professional: "Profis.",
  engagement: "Engaj.",
};

const NUMERIC: { key: NumericKey; label: string; full: string; desc: string; rule: string }[] = [
  ...RUBRIC_DIMENSIONS.map((d) => ({
    key: d.key as NumericKey,
    label: SHORT[d.key],
    full: `${d.label} (${d.key})`,
    desc: d.question,
    rule: `Peso no composto ${DIMENSION_WEIGHTS[d.key]} · piso ${ACCEPT_MIN}: ${d.anchors[ACCEPT_MIN as 3]}`,
  })),
  {
    key: "overall",
    label: "Geral",
    full: "Qualidade geral (overall)",
    desc: OVERALL_QUESTION,
    rule: `Não entra na regra de aceitação: quem decide é o composto ponderado das quatro (≥ ${ACCEPT_COMPOSITE_MIN}).`,
  },
];

const COLS = NUMERIC.length + 6;

type Version = CorpusItem["versions"][number];

const TRIGGER_LABEL: Record<Version["trigger"], string> = {
  initial: "inicial",
  judge_retry: "reescrita do Judge",
  human_revision: "revisão humana",
};

export function CorpusPanel() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Braço do benchmark = modelo do Writer. "" = corpus original.
  const [arm, setArm] = React.useState("");
  const [escopo, setEscopo] = React.useState<Escopo>("corpus");
  const [page, setPage] = React.useState(1);
  const [aberto, setAberto] = React.useState<string | null>(null);

  React.useEffect(() => {
    setError(null);
    fetch(`/api/mas/export/corpus${arm ? `?model=${encodeURIComponent(arm)}` : ""}`)
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => setError("Falha ao carregar o corpus"));
  }, [arm]);

  // Trocar filtro volta para a primeira página e fecha o post aberto.
  React.useEffect(() => {
    setPage(1);
    setAberto(null);
  }, [arm, escopo]);

  // O original aparece sempre, mesmo sem execuções — é a referência das letras.
  const arms = React.useMemo(() => {
    const lista = data?.arms ?? [];
    return lista.some((a) => a.model === "") ? lista : [{ model: "", runs: 0 }, ...lista];
  }, [data]);

  const stats = data?.stats;
  const linhas = React.useMemo(() => {
    const items = data?.items ?? [];
    // Corpus primeiro, por letra (como o avaliador vê); fora do corpus depois.
    const dentro = items
      .filter((i) => i.inCorpus)
      .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    if (escopo === "corpus") return dentro;
    return [...dentro, ...items.filter((i) => !i.inCorpus)];
  }, [data, escopo]);
  const foraCount = (data?.items ?? []).filter((i) => !i.inCorpus).length;

  const totalPages = Math.max(1, Math.ceil(linhas.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagina = linhas.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chip = (ativo: boolean) =>
    `rounded-lg border px-3 py-1.5 text-[11.5px] transition-colors ${
      ativo
        ? "border-[var(--accent-purple)]/40 bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Corpus: o Judge é um gate de qualidade confiável?
          </h2>
          <p className="max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">
            Cada execução entra com o <strong>primeiro draft</strong>, que é o que o
            Judge viu antes de qualquer reescrita. Ele recebe a nota do Judge e as notas
            humanas no mesmo instrumento, e é a divergência entre as duas que o estudo
            mede.
          </p>
        </div>
        <StudyFormPanel />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          Modelo do Writer
        </span>
        {arms.map((a) => (
          <button
            key={a.model || "original"}
            onClick={() => setArm(a.model)}
            aria-pressed={arm === a.model}
            className={`${chip(arm === a.model)} font-mono`}
          >
            {armLabel(a.model)}
            <span className="ml-1.5 text-[var(--text-muted)]">{a.runs}</span>
          </button>
        ))}
      </div>

      {arm && (
        <p className="-mt-3 max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">
          Braço do benchmark: cada post recebe a <strong>mesma letra</strong> do post
          original do mesmo tópico, para comparar modelo a modelo. As letras do corpus
          original não mudam.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Posts no corpus"
          value={stats ? `${stats.corpus}/${stats.maxPosts}` : "—"}
          hint={stats ? `${stats.topicos} tópicos distintos · um post por tópico.` : "—"}
        />
        <Stat
          label="Aceitos pelo Judge"
          value={stats ? `${stats.accept} / ${stats.reject}` : "—"}
          hint="ACCEPT / REJECT no corpus."
          tone="text-[var(--text-secondary)]"
        />
        <Stat
          label="Equilíbrio"
          value={stats?.balance != null ? `${Math.round(stats.balance * 100)}%` : "—"}
          hint="Fração da classe minoritária. Baixo demais e a matriz de confusão degenera."
          tone={stats?.balanceWarning ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]"}
        />
        <Stat
          label="Avaliações esperadas"
          value={String(stats?.avaliacoesEsperadas ?? 0)}
          hint={`${stats?.corpus ?? 0} posts × ${stats?.raters ?? 3} avaliadores.`}
          tone="text-[var(--text-secondary)]"
        />
      </div>

      {stats?.balanceWarning && stats.corpus > 0 && (
        <Aviso>
          O corpus está desequilibrado: <strong>{stats.accept} ACCEPT</strong> e{" "}
          <strong>{stats.reject} REJECT</strong>. Com uma das classes quase vazia, a
          matriz de confusão perde a célula de <strong>falso-aceite</strong>. A saída é
          gerar mais execuções, não escolher a dedo quais posts entram.
        </Aviso>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
          <span className="text-[12px] text-[var(--text-muted)]">
            Clique numa linha para ver o post e todas as versões.
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEscopo("corpus")} aria-pressed={escopo === "corpus"} className={chip(escopo === "corpus")}>
              Corpus ({stats?.corpus ?? 0})
            </button>
            <button onClick={() => setEscopo("todas")} aria-pressed={escopo === "todas"} className={chip(escopo === "todas")}>
              Todas as execuções ({(stats?.corpus ?? 0) + foraCount})
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
            {/* O arquivo traz todas as execuções do modelo selecionado, dentro e
                fora do corpus, com `inCorpus` e o motivo da exclusão em colunas. */}
            {(["csv", "xlsx"] as const).map((f) => (
              <a
                key={f}
                href={`/api/mas/export/corpus?format=${f}${arm ? `&model=${encodeURIComponent(arm)}` : ""}`}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <Download size={12} />
                .{f}
              </a>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Post</th>
                <th className="px-3 py-2.5 font-medium">Tópico</th>
                <th className="px-3 py-2.5 text-center font-medium">Gate</th>
                {NUMERIC.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 text-center font-medium">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-4">
                          {c.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6} className="max-w-[320px] flex-col items-start gap-1.5 text-left">
                        <span className="font-semibold text-[var(--text-primary)]">{c.full}</span>
                        <span className="text-[var(--text-secondary)]">{c.desc}</span>
                        <span className="text-[var(--text-muted)]">{c.rule}</span>
                      </TooltipContent>
                    </Tooltip>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-medium">Chars</th>
                <th className="px-3 py-2.5 text-center font-medium">Versões</th>
              </tr>
            </thead>
            <tbody>
              {pagina.length ? (
                pagina.map((i) => {
                  const chave = i.versionId || i.threadId;
                  const open = aberto === chave;
                  return (
                    <React.Fragment key={chave}>
                      <tr
                        onClick={() => i.content && setAberto(open ? null : chave)}
                        className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] ${
                          i.content ? "cursor-pointer" : ""
                        } ${i.inCorpus ? "" : "opacity-60"}`}
                      >
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">
                          {i.content ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">
                          {i.label ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                          <span className="line-clamp-1 max-w-[260px]">{i.topic}</span>
                          {i.exclusion && (
                            <span className="text-[10.5px] text-[var(--accent-amber)]">
                              fora: {EXCLUSION_LABEL[i.exclusion] ?? i.exclusion}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <DecisionBadge decision={i.judgement?.decision} />
                        </td>
                        {NUMERIC.map((c) => (
                          <td key={c.key} className="px-3 py-2.5 text-center">
                            <ScoreCell value={i.judgement?.[c.key]} />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-muted)]">
                          {i.charCount || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                          {i.versions.length || "—"}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                          <td colSpan={COLS} className="px-4 py-4">
                            <PostDetail item={i} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={COLS} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    {data == null
                      ? "Carregando…"
                      : arm
                        ? "Nenhum post deste modelo ainda nos tópicos do corpus original."
                        : "Nenhum post elegível ainda: o corpus precisa de execuções com a v1 avaliada no instrumento vigente."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {linhas.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3">
            <span className="text-[11px] text-[var(--text-muted)]">
              {linhas.length} execuç{linhas.length === 1 ? "ão" : "ões"} · página {safePage}/{totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Todas as versões da execução. Abre na v1 — é ela que o estudo compara com as
 * notas humanas —, e as seguintes (reescritas do Judge, revisões humanas) ficam
 * a um clique, cada uma com a nota que o Judge deu para aquele texto.
 */
function PostDetail({ item }: { item: CorpusItem }) {
  const [sel, setSel] = React.useState(0);
  const v: Version | undefined = item.versions[sel];
  if (!v) return null;
  const issues = v.judgement?.issues ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.versions.map((ver, idx) => (
          <button
            key={ver.id}
            onClick={() => setSel(idx)}
            aria-pressed={sel === idx}
            className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
              sel === idx
                ? "border-[var(--accent-purple)]/40 bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            v{ver.version} · {TRIGGER_LABEL[ver.trigger] ?? ver.trigger}
            {idx === 0 && item.label ? " · no form" : ""}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
          {armLabel(item.writerModel)} · {item.threadId}
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <pre className="max-h-[360px] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 font-sans text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {v.content}
        </pre>
        <div className="flex flex-col gap-2 md:w-[280px]">
          {v.judgement ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2">
              <DecisionBadge decision={v.judgement.decision} />
              {NUMERIC.map((c) => (
                <span key={c.key} className="text-[11px] text-[var(--text-muted)]">
                  {c.label} <ScoreCell value={v.judgement?.[c.key]} />
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)]">Versão sem nota do Judge.</span>
          )}
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            {v.charCount} chars · {new Date(v.createdAt).toLocaleString("pt-BR")}
          </span>
          {issues.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                O que o Judge apontou
              </span>
              <ul className="mt-1 list-disc pl-4 text-[11.5px] text-[var(--text-secondary)]">
                {issues.map((t, n) => (
                  <li key={n}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] px-3.5 py-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--accent-amber)]" />
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
      <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <div className={`mt-1 text-[24px] font-semibold ${tone}`}>{value}</div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
