"use client";

import type { RevisionPair, RevisionStats } from "@/app/MAS/lib/revisionPairs";
import type { JudgeResult } from "@/app/MAS/types/types";
import { StudyFormPanel } from "@/components/dashboard/study-form-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Upload } from "lucide-react";
import * as React from "react";

// Página do estudo Agent-as-judge.
//
// UMA unidade de análise: o par antes/depois dentro da mesma execução — o
// primeiro draft contra a última versão que o loop do Judge produziu. Revisão
// humana não entra: assim que o humano edita, o texto deixa de ser produto da
// crítica do Judge.
//
// Cada par vira DUAS linhas na tabela, "não revisado" e "revisado", com rótulo
// cego. O avaliador humano pontua as duas separadamente e sem saber que são o
// mesmo post — é o CSV do Forms que reencontra o par, pela letra.

interface Payload {
  pairs: RevisionPair[];
  stats: RevisionStats;
}

// Critérios compartilhados (form ↔ agente). `full`/`desc`/`rule` são a definição
// do rubric em judge.prompt.ts — o mesmo texto que o Judge lê e que vai nas
// perguntas do form. Se o rubric mudar, mudar aqui junto.
const NUMERIC = [
  {
    key: "overall",
    label: "Geral",
    full: "Qualidade geral (score)",
    desc: "Nota holística considerando todas as dimensões e o impacto provável no algoritmo. É a última coisa que o Judge emite, depois das subnotas e do diagnóstico.",
    rule: "Gate do pipeline: score ≥ 7 libera para revisão humana; abaixo disso volta para o writer.",
  },
  {
    key: "hook",
    label: "Gancho",
    full: "Gancho (hookQuality)",
    desc: "Os primeiros ~210 caracteres — o que aparece antes do “ver mais” — param o scroll? Vale dado surpreendente, contradição, pergunta específica ou história pessoal.",
    rule: "Abertura genérica (“vou falar sobre X”): ≤ 3.",
  },
  {
    key: "originality",
    label: "Orig.",
    full: "Originalidade (originality)",
    desc: "Traz insight próprio, dado concreto, anedota ou tese contrária — ou é senso comum genérico, o tipo de texto que qualquer LLM produziria sobre o tema?",
    rule: "Sem ponto de vista próprio: ≤ 4.",
  },
  {
    key: "scannability",
    label: "Scan.",
    full: "Escaneabilidade (scannability)",
    desc: "Estrutura visual: frases curtas, parágrafos de 1–2 linhas, listas, espaço em branco. Mede se dá para escanear com os olhos antes de decidir ler.",
    rule: "Parágrafo único denso: ≤ 3 · bem espaçado com bullets: 7+.",
  },
  {
    key: "cta",
    label: "CTA",
    full: "Qualidade do CTA (ctaQuality)",
    desc: "A chamada da última linha convida a um comentário real, ancorado no conteúdo do post e na experiência do leitor?",
    rule: "Vago (“thoughts?”, “concorda?”): ≤ 4 · sem CTA: 0.",
  },
] as const;

const AGENT_COL: Record<string, keyof JudgeResult> = {
  overall: "score",
  hook: "hookQuality",
  originality: "originality",
  scannability: "scannability",
  cta: "ctaQuality",
};

type HumanByPost = Record<string, Record<string, number>>;

type PairFilter = "amostra" | "elegiveis" | "todos";

const FILTERS: { key: PairFilter; label: string }[] = [
  { key: "amostra", label: "amostra do form" },
  { key: "elegiveis", label: "elegíveis" },
  { key: "todos", label: "todos" },
];

// Por que um par ficou fora — mostrado no card quando o filtro abre o dataset.
// A regra de amostragem é decisão do desenho, não detalhe de implementação:
// quem olha a tela precisa ver o que caiu e por quê.
const EXCLUSION_LABEL: Record<string, string> = {
  sem_nota_no_antes: "sem nota no antes",
  sem_nota_no_depois: "sem nota no depois",
  revisao_humana: "revisão humana",
  sem_loop_do_judge: "sem loop do judge",
  run_descartado: "execução descartada",
  par_intermediario: "par intermediário",
  topico_repetido: "tópico repetido",
  acima_do_teto: "acima do teto do form",
};

// Parser CSV mínimo (RFC 4180): aspas, vírgulas dentro de aspas, \r\n.
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

/** Forms wide (`A_overall`, `A_hook`…) → média por post/critério. */
function humanMeans(
  parsed: Record<string, string>[],
  labels: string[],
): HumanByPost {
  const out: HumanByPost = {};
  for (const label of labels) {
    const crit: Record<string, number> = {};
    for (const { key } of NUMERIC) {
      const vals = parsed
        .map((r) => Number(r[`${label}_${key}`]))
        .filter((v) => Number.isFinite(v));
      if (vals.length) crit[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    if (Object.keys(crit).length) out[label] = crit;
  }
  return out;
}

// Flags booleanas do JudgeResult. `bomQuandoTrue` diz a polaridade: as duas
// primeiras são qualidades, as duas últimas são defeitos (e disparam os caps
// duros do rubric — bait derruba o score para ≤ 4).
const FLAGS: {
  key: keyof JudgeResult;
  label: string;
  bomQuandoTrue: boolean;
}[] = [
  { key: "lengthAdequate", label: "tamanho ok", bomQuandoTrue: true },
  { key: "toneLinkedIn", label: "tom LinkedIn", bomQuandoTrue: true },
  { key: "hasEngagementBait", label: "engagement bait", bomQuandoTrue: false },
  { key: "hasExternalLinkInBody", label: "link no corpo", bomQuandoTrue: false },
];

/** Notas e flags de UMA versão — o que o Judge devolveu para aquele draft. */
function VersionScores({ judgement }: { judgement: JudgeResult | null }) {
  if (!judgement) {
    return (
      <span className="text-[11px] text-[var(--text-muted)]">sem avaliação</span>
    );
  }
  const tone = (v: number) =>
    v >= 7
      ? "text-[var(--accent-green)]"
      : v >= 5
        ? "text-[var(--accent-amber)]"
        : "text-[var(--accent-red)]";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {NUMERIC.map((c) => {
          const v = judgement[AGENT_COL[c.key]] as number;
          return (
            <span key={c.key} className="text-[11px] text-[var(--text-muted)]">
              {c.label}{" "}
              <span className={`font-mono tabular-nums ${tone(v)}`}>{v}</span>
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        {FLAGS.map((f) => {
          const ativo = judgement[f.key] as boolean;
          const bom = ativo === f.bomQuandoTrue;
          return (
            <span
              key={f.key}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                bom
                  ? "border-[var(--border-active)] text-[var(--text-muted)]"
                  : "border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] text-[var(--accent-red)]"
              }`}
              title={
                f.bomQuandoTrue
                  ? `${f.label}: ${ativo ? "sim" : "não"}`
                  : `${f.label}: ${ativo ? "detectado" : "não detectado"}`
              }
            >
              {f.bomQuandoTrue ? (ativo ? "✓" : "✗") : ativo ? "⚠" : "✓"} {f.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ScoreCell({ value }: { value: number | undefined }) {
  if (value == null) return <span className="text-[var(--text-muted)]">—</span>;
  const tone =
    value >= 7
      ? "text-[var(--accent-green)]"
      : value >= 5
        ? "text-[var(--accent-amber)]"
        : "text-[var(--accent-red)]";
  return <span className={`font-mono tabular-nums ${tone}`}>{value.toFixed(1)}</span>;
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
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function ConditionBadge({ revisado }: { revisado: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        revisado
          ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
          : "border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]"
      }`}
    >
      {revisado ? "revisado" : "não revisado"}
    </span>
  );
}

/** Comparação lado a lado das duas versões de um par. */
function PairComparison({ pair }: { pair: RevisionPair }) {
  const [open, setOpen] = React.useState(false);
  const issues = pair.before.judgement?.issues ?? [];
  const chave = pair.excludeReason ?? pair.sampleExclusion;
  const motivo = chave ? (EXCLUSION_LABEL[chave] ?? chave) : null;
  const lados = [
    { titulo: "Não revisado", v: pair.before, revisado: false },
    { titulo: "Revisado", v: pair.after, revisado: true },
  ];

  return (
    <div
      className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] ${
        pair.inSample ? "" : "opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-[13px] text-[var(--text-primary)]">
            {pair.topic}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            {pair.before.label && pair.after.label && (
              <span className="font-mono">
                Post {pair.before.label} → Post {pair.after.label}
              </span>
            )}
            <span className="font-mono">
              v{pair.before.version} → v{pair.after.version}
            </span>
            {pair.kind === "consecutive" && (
              <span className="rounded-full border border-[var(--border-active)] px-2 py-0.5">
                intermediário
              </span>
            )}
            {motivo && (
              <span className="rounded-full border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-dim)] px-2 py-0.5 text-[var(--accent-amber)]">
                {motivo}
              </span>
            )}
            {pair.exhausted && (
              <span
                className="rounded-full border border-[var(--border-active)] px-2 py-0.5"
                title="Estourou MAX_JUDGE_RETRIES: o Judge nunca aprovou, então a versão final não passou pela seleção “revisado até o juiz aceitar”"
              >
                nunca aprovado
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
          {pair.before.judgement?.score ?? "—"} → {pair.after.judgement?.score ?? "—"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] px-4 py-4">
          {issues.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2">
              <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                Crítica que disparou a revisão
              </span>
              <ul className="mt-1 list-disc pl-4 text-[12px] text-[var(--text-secondary)]">
                {issues.map((i, n) => (
                  <li key={n}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-4 md:flex-row">
            {lados.map((lado) => (
              <div key={lado.titulo} className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ConditionBadge revisado={lado.revisado} />
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {lado.v.label && (
                      <>
                        Post{" "}
                        <strong className="text-[var(--text-secondary)]">
                          {lado.v.label}
                        </strong>
                        {" · "}
                      </>
                    )}
                    v{lado.v.version} · {lado.v.charCount} chars
                  </span>
                </div>
                <VersionScores judgement={lado.v.judgement} />
                <pre className="max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 font-sans text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {lado.v.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Row {
  key: string;
  post: string;
  topic: string;
  revisado: boolean;
  judgement: JudgeResult | null;
}

export function EstudoView() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [human, setHuman] = React.useState<HumanByPost | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Filtro da seção de comparação. A TABELA acima fica sempre na amostra: ela é
  // o artefato do formulário (rótulo cego, nota humana, Δ), e esses campos não
  // existem para um par que ninguém vai avaliar.
  const [filter, setFilter] = React.useState<PairFilter>("amostra");

  React.useEffect(() => {
    fetch("/api/mas/export/revision-pairs")
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => setError("Falha ao carregar os pares do estudo"));
  }, []);

  const stats = data?.stats;
  const amostra = React.useMemo(
    () => (data?.pairs ?? []).filter((p) => p.inSample),
    [data],
  );
  const comparados = React.useMemo(() => {
    const todos = data?.pairs ?? [];
    if (filter === "amostra") return todos.filter((p) => p.inSample);
    if (filter === "elegiveis") return todos.filter((p) => p.eligible);
    return todos;
  }, [data, filter]);

  // Uma linha por post do form: cada par rende o "não revisado" e o "revisado".
  // Ordenado por rótulo, que é como o avaliador vê no formulário.
  const rows: Row[] = React.useMemo(
    () =>
      amostra
        .flatMap((p) => [
          {
            key: p.before.id,
            post: p.before.label ?? "",
            topic: p.topic,
            revisado: false,
            judgement: p.before.judgement,
          },
          {
            key: p.after.id,
            post: p.after.label ?? "",
            topic: p.topic,
            revisado: true,
            judgement: p.after.judgement,
          },
        ])
        .sort((a, b) => a.post.localeCompare(b.post)),
    [amostra],
  );

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        setHuman(
          humanMeans(
            parseCSV(txt),
            rows.map((r) => r.post).filter(Boolean),
          ),
        );
        setError(null);
      } catch {
        setError("CSV inválido — confira o padrão de colunas (ver FORM-AVALIACAO.md)");
      }
    });
  }

  const acao =
    "rounded-lg border border-[var(--border-active)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]";

  return (
    <div className="flex flex-col gap-7">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Estudo: a revisão do agente melhora o post?
          </h2>
          <p className="max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">
            Cada execução rende um par: o <strong>primeiro draft</strong> contra a{" "}
            <strong>última versão que o loop do Judge produziu</strong> — mesma pesquisa,
            mesmos insights, só a revisão muda. Os dois vão ao formulário com rótulos
            cegos e separados, para o avaliador não perceber que são o mesmo post.
          </p>
        </div>
        <StudyFormPanel />
      </div>

      {/* Números do dataset */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Aprovados de primeira"
          value={
            stats?.firstPassRate != null
              ? `${Math.round(stats.firstPassRate * 100)}%`
              : "—"
          }
          hint={
            stats
              ? `${stats.firstPass} de ${stats.runsAvaliados} execuções — os casos de efeito zero, que os pares não contêm.`
              : "—"
          }
          tone="text-[var(--accent-amber)]"
        />
        <Stat
          label="Posts no formulário"
          value={stats ? `${stats.versoesRotuladas}/${stats.formMaxPosts}` : "—"}
          hint={
            stats
              ? `${stats.pairsNaAmostra} pares · um por execução, um por tópico.`
              : "—"
          }
        />
        <Stat
          label="Nunca aprovados"
          value={String(stats?.exhaustedRuns ?? 0)}
          hint="Estouraram o limite de reescritas — a versão final não passou pela seleção “revisado até o juiz aceitar”."
          tone="text-[var(--accent-green)]"
        />
        <Stat
          label="Δ médio do Judge"
          value={
            stats?.deltaJudgeMedio != null
              ? `${stats.deltaJudgeMedio > 0 ? "+" : ""}${stats.deltaJudgeMedio.toFixed(1)}`
              : "—"
          }
          hint="Descritivo, NÃO evidência: a versão revisada foi escrita para agradar este mesmo juiz."
          tone="text-[var(--text-secondary)]"
        />
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <a href="/api/mas/export/revision-pairs?format=xlsx" className={acao}>
          Baixar .xlsx
        </a>
        <a href="/api/mas/export/revision-pairs?format=csv" className={acao}>
          Baixar .csv
        </a>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--accent-purple)]/40 bg-[var(--accent-purple-dim)] px-3 py-2 text-[12px] text-[var(--accent-purple)] transition-colors hover:bg-[var(--accent-purple)]/20">
          <Upload size={13} />
          Subir CSV do Forms
          <input type="file" accept=".csv,text/csv" onChange={onUpload} className="hidden" />
        </label>
        {human && (
          <span className="text-[11px] text-[var(--accent-green)]">
            CSV humano carregado ✓
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      {/* Tabela: um post por linha */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
              <th className="px-3 py-2.5 font-medium">Post</th>
              <th className="px-3 py-2.5 font-medium">Tópico</th>
              <th className="px-3 py-2.5 font-medium">Condição</th>
              {NUMERIC.map((c) => (
                <th key={c.key} className="px-3 py-2.5 text-center font-medium">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-4">
                        {c.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={6}
                      className="max-w-[320px] flex-col items-start gap-1.5 text-left"
                    >
                      <span className="font-semibold text-[var(--text-primary)]">
                        {c.full}
                      </span>
                      <span className="text-[var(--text-secondary)]">{c.desc}</span>
                      <span className="text-[var(--text-muted)]">{c.rule}</span>
                    </TooltipContent>
                  </Tooltip>
                </th>
              ))}
              {human && (
                <th className="px-3 py-2.5 text-center font-medium">
                  Humano
                  <br />
                  (geral)
                </th>
              )}
              {human && <th className="px-3 py-2.5 text-center font-medium">Δ geral</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => {
                const h = human?.[r.post];
                const agente = r.judgement?.score;
                const humano = h?.overall;
                const delta =
                  agente != null && humano != null ? agente - humano : null;
                return (
                  <tr
                    key={r.key}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]"
                  >
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">
                      {r.post}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      <span className="line-clamp-1 max-w-[220px]">{r.topic}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ConditionBadge revisado={r.revisado} />
                    </td>
                    {NUMERIC.map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-center">
                        <ScoreCell
                          value={
                            r.judgement
                              ? (r.judgement[AGENT_COL[c.key]] as number)
                              : undefined
                          }
                        />
                      </td>
                    ))}
                    {human && (
                      <td className="px-3 py-2.5 text-center">
                        <ScoreCell value={humano} />
                      </td>
                    )}
                    {human && (
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                        {delta != null
                          ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`
                          : "—"}
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={NUMERIC.length + 5}
                  className="px-3 py-8 text-center text-[var(--text-muted)]"
                >
                  {data == null
                    ? "Carregando…"
                    : "Nenhum par ainda. Um par aparece quando o Judge reprova um draft (score < 7) e o writer reescreve — execuções aprovadas de primeira não geram par e entram na taxa acima."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Textos lado a lado */}
      {(data?.pairs.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Antes e depois, lado a lado{" "}
              <span className="font-normal text-[var(--text-muted)]">
                ({comparados.length})
              </span>
            </h3>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                    filter === f.key
                      ? "bg-[var(--bg-input)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {comparados.length ? (
            comparados.map((p) => <PairComparison key={p.pairId} pair={p} />)
          ) : (
            <p className="rounded-xl border border-[var(--border-subtle)] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
              Nenhum par neste filtro.
            </p>
          )}
        </div>
      )}

      {/* Rodapé metodológico */}
      <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <p>
          <strong>Amostra:</strong> um par por execução (o loop inteiro), um par por
          tópico e teto de {stats?.formMaxPosts ?? 8} posts, priorizando as execuções
          que o Judge nunca aprovou. Revisões humanas não entram — o par termina na
          última versão do Judge. Rodar uma execução nova só acrescenta letras, não
          remapeia as já distribuídas.
          {!!stats?.runsDescartados && (
            <>
              {" "}
              <strong>{stats.runsDescartados}</strong>{" "}
              {stats.runsDescartados === 1 ? "execução descartada" : "execuções descartadas"}{" "}
              do estudo continuam no banco e no .csv, com o motivo.
            </>
          )}
        </p>
        <p>
          O <strong>Δ do Judge não é o resultado do estudo</strong>: Judge e Writer são o
          mesmo modelo e a versão revisada foi escrita para agradar este juiz, então ele
          tende a pontuá-la acima por construção. Quem mede alguma coisa é o delta{" "}
          <strong>humano</strong>, vindo do formulário. Análise completa (Spearman, ICC,
          Wilcoxon + tamanho de efeito) em{" "}
          <span className="font-mono">study/analysis/quality_study.py</span>.
        </p>
      </div>
    </div>
  );
}
