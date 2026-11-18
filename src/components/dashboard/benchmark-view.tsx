"use client";

import { ACCEPT_COMPOSITE_MIN } from "@/app/MAS/lib/rubric";
import type { BenchmarkArm, BenchmarkData, ScoreKey } from "@/app/MAS/lib/studyBenchmark";
import { EChart } from "@/components/dashboard/echart";
import { PanelsSkeleton } from "@/components/dashboard/skeletons";
import type { EChartsCoreOption } from "echarts/core";
import { AlertTriangle } from "lucide-react";
import * as React from "react";

// ─── Benchmarks: os modelos do Writer lado a lado ────────────────────────────
//
// Cor = IDENTIDADE do modelo, fixa (a mesma em todo gráfico e em toda visita),
// nunca a posição no ranking — senão o 1º lugar trocaria de cor quando um
// modelo novo entrasse. Paleta categórica da skill de dataviz, versão escura,
// validada contra a superfície dos cards (#17171B): as 4 primeiras passam
// banda de luminosidade, croma, separação para daltonismo e contraste ≥ 3:1.

const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

/** Ordem fixa dos modelos conhecidos; os demais entram depois, em ordem de slug. */
const ORDEM_FIXA = ["", "openai/gpt-4.1", "anthropic/claude-sonnet-5", "google/gemini-3.8-flash"];

function coresPorModelo(models: string[]): Map<string, string> {
  const outros = models.filter((m) => !ORDEM_FIXA.includes(m)).sort();
  const ordem = [...ORDEM_FIXA, ...outros];
  // Passou de 8: cinza. Um 9º tom gerado seria indistinguível de um existente.
  return new Map(ordem.map((m, i) => [m, SLOTS[i] ?? "#6b6b7b"]));
}

// Tinta do texto — tokens do tema, nunca a cor da série.
const INK = { primary: "#E8E8EE", secondary: "#8888A0", muted: "#55556A", grid: "#1F1F26", surface: "#17171B" };

const DIMS: { key: ScoreKey; label: string }[] = [
  { key: "clarity", label: "Clareza" },
  { key: "relevance", label: "Relevância" },
  { key: "professional", label: "Profissional" },
  { key: "engagement", label: "Engajamento" },
  { key: "overall", label: "Geral" },
];

const TOOLTIP = {
  backgroundColor: INK.surface,
  borderColor: INK.grid,
  textStyle: { color: INK.primary, fontSize: 12 },
  extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);",
};

const fmt = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function BenchmarkView() {
  const [data, setData] = React.useState<BenchmarkData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/mas/export/benchmark")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erro ${r.status}`))))
      .then((d: BenchmarkData) => setData(d))
      .catch(() => setError("Falha ao carregar o benchmark"));
  }, []);

  const cor = React.useMemo(() => coresPorModelo((data?.arms ?? []).map((a) => a.model)), [data]);
  const comPosts = React.useMemo(
    () =>
      (data?.arms ?? [])
        .filter((a) => a.n > 0 && a.means)
        .sort((a, b) => b.means!.composite - a.means!.composite),
    [data],
  );
  const semPosts = (data?.arms ?? []).filter((a) => a.n === 0);

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red-dim)] px-3.5 py-2.5 text-[12px] text-[var(--accent-red)]">
        {error}
      </div>
    );
  }
  if (!data) return <PanelsSkeleton cards={3} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Benchmark: qual modelo escreve melhor?
        </h2>
        <p className="max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">
          Notas do Judge na <strong>v1</strong> de cada post, nos mesmos tópicos do corpus
          original. Só o Writer muda entre os modelos. A ordem é pela{" "}
          <strong>nota composta</strong> — a média ponderada que decide ACCEPT/REJECT
          (limiar {fmt(ACCEPT_COMPOSITE_MIN, 1)}).
        </p>
      </div>

      {data.mixedJudges && (
        <Aviso>
          <strong>As notas não vieram do mesmo juiz.</strong> Os modelos abaixo foram
          avaliados com Judge ou prompt diferentes (veja a coluna “Juiz” na tabela). A
          diferença entre eles mistura o escritor com o avaliador — para comparar de
          verdade, os braços precisam ser pontuados pelo mesmo Judge.
        </Aviso>
      )}

      {/* Um tile por modelo, na ordem do ranking. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {comPosts.map((a, i) => (
          <ArmTile key={a.model || "original"} arm={a} rank={i + 1} color={cor.get(a.model)!} />
        ))}
      </div>

      {semPosts.length > 0 && (
        <p className="-mt-2 text-[12px] text-[var(--text-muted)]">
          Sem posts ainda:{" "}
          {semPosts.map((a, i) => (
            <span key={a.model || "original"}>
              {i > 0 && " · "}
              <span className="font-mono text-[var(--text-secondary)]">{a.model || a.label}</span>
            </span>
          ))}
          . Gere os tópicos do corpus com esses modelos para eles entrarem na comparação.
        </p>
      )}

      {comPosts.length === 0 ? (
        <p className="rounded-xl border border-[var(--border-subtle)] px-4 py-10 text-center text-[12px] text-[var(--text-muted)]">
          Nenhum modelo tem posts avaliados ainda.
        </p>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Ranking pela nota composta"
              desc="Média por modelo. A linha marca o limiar de aprovação."
            >
              <EChart
                option={rankingOption(comPosts, cor)}
                height={Math.max(140, comPosts.length * 48 + 60)}
                ariaLabel={`Ranking: ${comPosts.map((a) => `${a.label} ${fmt(a.means!.composite)}`).join(", ")}`}
              />
            </Card>
            <Card title="Média por dimensão" desc="Escala 1–5 da rubrica, por modelo.">
              <EChart
                option={dimensoesOption(comPosts, cor)}
                height={300}
                ariaLabel="Média das notas do Judge por dimensão e por modelo"
              />
            </Card>
          </div>

          <Card
            title="Nota composta por post"
            desc="Mesma letra = mesmo tópico em todos os modelos. Célula vazia: o modelo ainda não tem post naquele tópico."
          >
            <EChart
              option={heatmapOption(data, comPosts)}
              height={comPosts.length * 44 + 110}
              ariaLabel="Mapa de calor da nota composta de cada post por modelo"
            />
          </Card>

          <TabelaModelos arms={comPosts} cor={cor} />
        </>
      )}
    </div>
  );
}

// ─── Opções dos gráficos ─────────────────────────────────────────────────────

const eixoValor = (max = 5) => ({
  type: "value",
  min: 0,
  max,
  interval: 1,
  axisLabel: { color: INK.secondary, fontSize: 11 },
  splitLine: { lineStyle: { color: INK.grid, width: 1, type: "solid" } },
  axisLine: { show: false },
});

const eixoCategoria = (data: string[]) => ({
  type: "category",
  data,
  axisLabel: { color: INK.secondary, fontSize: 11 },
  axisLine: { lineStyle: { color: INK.grid } },
  axisTick: { show: false },
});

function rankingOption(arms: BenchmarkArm[], cor: Map<string, string>): EChartsCoreOption {
  // Horizontal, 1º lugar no topo (o eixo de categoria do ECharts cresce de baixo).
  const ordem = [...arms].reverse();
  return {
    aria: { enabled: true },
    grid: { left: 8, right: 56, top: 16, bottom: 24, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const a = ordem[p.dataIndex];
        return `<b>${a.label}</b><br/>Composta ${fmt(a.means!.composite)} · ${a.n} posts<br/>Aprovados ${a.accept}/${a.n}`;
      },
    },
    xAxis: eixoValor(),
    yAxis: eixoCategoria(ordem.map((a) => a.label)),
    series: [
      {
        type: "bar",
        barMaxWidth: 24,
        data: ordem.map((a) => ({
          value: Number(a.means!.composite.toFixed(2)),
          itemStyle: { color: cor.get(a.model), borderRadius: [0, 4, 4, 0] },
        })),
        // Valor na ponta da barra, em tinta de texto (nunca na cor da série).
        label: {
          show: true,
          position: "right",
          color: INK.primary,
          fontSize: 12,
          formatter: (p: { value: number }) => fmt(p.value),
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: INK.secondary, width: 1, type: "solid" },
          label: { color: INK.secondary, fontSize: 10, formatter: `limiar ${fmt(ACCEPT_COMPOSITE_MIN, 1)}` },
          data: [{ xAxis: ACCEPT_COMPOSITE_MIN }],
        },
      },
    ],
  };
}

function dimensoesOption(arms: BenchmarkArm[], cor: Map<string, string>): EChartsCoreOption {
  const varios = arms.length > 1;
  return {
    aria: { enabled: true },
    // Legenda só com 2+ séries: com uma, o título já diz o que é.
    legend: varios
      ? { top: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: INK.secondary, fontSize: 11 } }
      : undefined,
    grid: { left: 8, right: 8, top: varios ? 36 : 16, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.03)" } },
      valueFormatter: (v: number) => fmt(v),
    },
    xAxis: eixoCategoria(DIMS.map((d) => d.label)),
    yAxis: eixoValor(),
    series: arms.map((a) => ({
      type: "bar",
      name: a.label,
      barMaxWidth: 24,
      // ~2px de ar entre barras vizinhas do mesmo grupo.
      barGap: "12%",
      itemStyle: { color: cor.get(a.model), borderRadius: [4, 4, 0, 0] },
      data: DIMS.map((d) => Number(a.means![d.key].toFixed(2))),
    })),
  };
}

function heatmapOption(data: BenchmarkData, arms: BenchmarkArm[]): EChartsCoreOption {
  const letras = data.topics.map((t) => t.label);
  const linhas = [...arms].reverse(); // 1º do ranking no topo
  const pontos: { value: [number, number, number]; label: { color: string } }[] = [];
  linhas.forEach((a, y) => {
    data.topics.forEach((t, x) => {
      const c = t.byModel[a.model];
      if (!c) return;
      // Texto claro nas células escuras, escuro nas claras — contraste por luminância.
      pontos.push({ value: [x, y, Number(c.composite.toFixed(2))], label: { color: c.composite >= 3.8 ? "#0d1117" : INK.primary } });
    });
  });
  return {
    aria: { enabled: true },
    grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: (p: { value: [number, number, number] }) => {
        const t = data.topics[p.value[0]];
        const a = linhas[p.value[1]];
        const c = t.byModel[a.model];
        return `<b>Post ${t.label}</b> · ${a.label}<br/><span style="color:${INK.secondary}">${t.topic}</span><br/>Composta ${fmt(c.composite)} · Geral ${c.overall} · ${c.decision}`;
      },
    },
    xAxis: { ...eixoCategoria(letras), splitArea: { show: false } },
    yAxis: { ...eixoCategoria(linhas.map((a) => a.label)), splitArea: { show: false } },
    // Sequencial, um tom só (azul): mais claro = nota maior, sobre a superfície escura.
    visualMap: {
      min: 1,
      max: 5,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 120,
      text: ["5", "1"],
      textStyle: { color: INK.secondary, fontSize: 11 },
      inRange: { color: ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#b7d3f6"] },
    },
    series: [
      {
        type: "heatmap",
        data: pontos,
        label: { show: true, fontSize: 11, formatter: (p: { value: [number, number, number] }) => fmt(p.value[2], 1) },
        // Borda na cor da superfície = o "gap" de 2px entre células.
        itemStyle: { borderColor: INK.surface, borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: INK.primary, borderWidth: 1 } },
      },
    ],
  };
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function ArmTile({ arm, rank, color }: { arm: BenchmarkArm; rank: number; color: string }) {
  const taxa = arm.n ? Math.round((arm.accept / arm.n) * 100) : 0;
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-[12px] font-medium text-[var(--text-secondary)]">{arm.label}</span>
        <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">#{rank}</span>
      </div>
      <div className="mt-2 text-[26px] font-semibold text-[var(--text-primary)]">{fmt(arm.means!.composite)}</div>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
        nota composta · {arm.n} posts · {taxa}% aprovados ({arm.accept}/{arm.n})
      </p>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-3 mt-0.5 text-[11.5px] text-[var(--text-muted)]">{desc}</p>
      {children}
    </section>
  );
}

/** A versão em tabela dos gráficos — todo valor legível sem hover. */
function TabelaModelos({ arms, cor }: { arms: BenchmarkArm[]; cor: Map<string, string> }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="w-full min-w-[820px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
            <th className="px-3 py-2.5 font-medium">Modelo</th>
            <th className="px-3 py-2.5 text-center font-medium">Posts</th>
            <th className="px-3 py-2.5 text-center font-medium">Aprovados</th>
            <th className="px-3 py-2.5 text-center font-medium">Composta</th>
            {DIMS.map((d) => (
              <th key={d.key} className="px-3 py-2.5 text-center font-medium">
                {d.label}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center font-medium">Chars</th>
            <th className="px-3 py-2.5 font-medium">Juiz</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((a) => (
            <tr key={a.model || "original"} className="border-b border-[var(--border-subtle)] last:border-0">
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2 text-[var(--text-primary)]">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: cor.get(a.model) }} />
                  {a.label}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">{a.n}</td>
              <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                {a.accept}/{a.n}
              </td>
              <td className="px-3 py-2.5 text-center font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                {fmt(a.means!.composite)}
              </td>
              {DIMS.map((d) => (
                <td key={d.key} className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                  {fmt(a.means![d.key])}
                </td>
              ))}
              <td className="px-3 py-2.5 text-center font-mono tabular-nums text-[var(--text-muted)]">
                {fmt(a.meanChars, 0)}
              </td>
              <td className="px-3 py-2.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                {a.judgeModels.join(", ") || "—"} · {a.rubricHashes.map((h) => h.slice(0, 8)).join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
