import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Esqueletos de carregamento ──────────────────────────────────────────────
//
// Um lugar só para todas as telas: as cinco superfícies de dado do dashboard
// mostravam "Carregando X..." centralizado, cada uma com o seu texto. Texto não
// diz quanto conteúdo vem nem onde ele vai cair, então a tela pula quando o
// dado chega. O esqueleto ocupa a forma final e o salto some.
//
// O `Skeleton` do shadcn pinta `bg-muted` (#18181C), que sobre `--bg-card`
// (#17171B) é invisível — a diferença é de um dígito hex. Por isso todo bloco
// daqui passa por `Barra`, que troca o tom por um que se enxerga sobre card.

function Barra({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <Skeleton
      style={style}
      className={cn("bg-[var(--border-active)]/70", className)}
    />
  );
}

/**
 * Linhas de lista com avatar — execuções recentes e posts.
 *
 * `rows` deve bater com o que a tela mostra cheia; menos linhas encolheriam o
 * container no momento em que o dado chega, que é o salto que queremos evitar.
 */
export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 last:border-0"
        >
          <Barra className="size-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* Larguras alternadas: uma coluna de barras idênticas lê como
                falha de renderização, não como carregamento. */}
            <Barra
              className="h-3.5 rounded"
              style={{ width: `${52 + ((i * 13) % 34)}%` }}
            />
            <Barra className="h-2.5 w-[38%] rounded" />
          </div>
          <Barra className="h-5 w-20 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Linhas de tabela em grid. `grid` é a MESMA string de colunas da tabela real,
 * para o esqueleto cair exatamente sob os cabeçalhos já visíveis.
 */
export function TableRowsSkeleton({
  rows = 8,
  cols,
  grid,
  avatar = true,
}: {
  rows?: number;
  cols: number;
  grid: string;
  /** Tabelas cuja primeira coluna não tem avatar (ex.: a matriz de permissões). */
  avatar?: boolean;
}) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "grid items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 last:border-0",
            grid,
          )}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex items-center gap-3">
              {c === 0 && avatar && (
                <Barra className="size-8 shrink-0 rounded-lg" />
              )}
              <Barra
                className="h-3.5 min-w-0 flex-1 rounded"
                style={{ maxWidth: c === 0 ? "100%" : `${44 + ((i + c) % 4) * 14}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Os quatro cards de KPI, na mesma grade e altura dos reais. */
export function KpiGridSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1"
    >
      {/* Mesmas medidas do KpiCard real (size="sm", gap-1.5, sem py próprio) —
          se divergirem, a grade salta no instante em que o dado chega. */}
      {Array.from({ length: 4 }).map((_, i) => (
        <Card
          key={i}
          size="sm"
          className="gap-0 border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0"
        >
          <CardContent className="flex flex-col gap-1.5">
            <Barra className="h-3 w-24 rounded" />
            <Barra className="h-5 w-12 rounded" />
            <Barra className="h-[18px] w-20 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * A tela de Configurações inteira: cabeçalho, barra de abas e o painel.
 *
 * Ela troca de conteúdo por aba, então o esqueleto para na moldura — desenhar
 * um painel específico obrigaria a adivinhar qual aba vai abrir, e a que abre
 * primeiro depende do papel de quem entrou (admin cai em Permissões).
 */
export function ConfigSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="flex items-center gap-2">
          <Barra className="h-5 w-20 rounded-md" />
          <Barra className="h-3.5 w-72 rounded max-[900px]:w-40" />
        </div>
        <div className="flex items-center gap-2.5">
          <Barra className="h-8 w-24 rounded-lg" />
          <Barra className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-[var(--border-subtle)] pb-2.5">
        <Barra className="h-7 w-24 rounded-md" />
        <Barra className="h-7 w-20 rounded-md" />
        <Barra className="h-7 w-20 rounded-md" />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <Barra className="h-3.5 w-32 rounded" />
          <Barra className="h-7 w-56 rounded-lg max-[640px]:w-32" />
        </div>
        <TableRowsSkeleton
          rows={6}
          cols={4}
          grid="grid-cols-[1.6fr_0.9fr_1fr_180px]"
        />
      </div>
    </div>
  );
}

/**
 * Telas de painéis empilhados: /agentes e /ferramentas.
 *
 * As duas abrem com uma linha de texto + botão salvar e depois N cartões de
 * configuração. `cards` ajusta a contagem (6 agentes, 2 ferramentas).
 */
export function PanelsSkeleton({
  cards = 6,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-hidden>
      <div className="flex items-center justify-between gap-4">
        <Barra className="h-3.5 w-96 rounded max-[900px]:w-48" />
        <Barra className="h-8 w-20 shrink-0 rounded-lg" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
            <Barra className="size-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Barra className="h-3.5 w-32 rounded" />
              <Barra className="h-2.5 w-56 rounded max-[640px]:w-32" />
            </div>
            <Barra className="h-5 w-10 shrink-0 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            <Barra className="h-3 w-24 rounded" />
            <Barra className="h-9 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
