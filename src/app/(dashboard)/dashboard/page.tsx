import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ModalPost } from "@/components/dashboard/modal-post";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  CheckCircle,
  Eye,
  Play,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="visão geral do sistema"
        actions={
          <>
            <Button variant="outline" size="sm">
              <RefreshCw size={13} />
              Atualizar
            </Button>
            <ModalPost />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-7">
        <div className="flex flex-col gap-6">
          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
            <KpiCard
              label="Execuções totais"
              value="—"
              icon={Play}
              trend="sem dados"
              trendType="flat"
            />
            <KpiCard
              label="Posts publicados"
              value="—"
              icon={BarChart3}
              trend="sem dados"
              trendType="flat"
            />
            <KpiCard
              label="Taxa de aprovação"
              value="—%"
              icon={CheckCircle}
              trend="sem dados"
              trendType="flat"
            />
            <KpiCard
              label="Revisões por post"
              value="—"
              icon={Eye}
              trend="sem dados"
              trendType="flat"
            />
          </div>

          {/* Two-col: execuções + pipeline */}
          <div className="grid grid-cols-[1fr_380px] gap-3.5 max-[1100px]:grid-cols-1">
            {/* Execuções recentes */}
            <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-0">
              <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <div>
                  <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                    Execuções recentes
                  </CardTitle>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    últimas 24h
                  </p>
                </div>
                <div className="flex gap-0.5">
                  <Button variant="flat" size="sm" className="h-7 px-3 text-xs">
                    Todas
                  </Button>
                  <Button variant="flat-ghost" size="sm" className="h-7 px-3 text-xs">
                    Em andamento
                  </Button>
                  <Button variant="flat-ghost" size="sm" className="h-7 px-3 text-xs">
                    Revisão
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <EmptyState
                  icon={Play}
                  title="Nenhuma execução ainda"
                  description="Crie uma nova execução para começar"
                />
              </CardContent>
            </Card>

            {/* Pipeline ativo */}
            <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-0">
              <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                  Pipeline ativo
                </CardTitle>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  —
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <EmptyState
                  icon={Play}
                  title="Nenhum pipeline ativo"
                  description="Inicie uma execução para ver os agentes"
                />
              </CardContent>
            </Card>
          </div>

          {/* Posts gerados */}
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-0">
            <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                Posts gerados
              </CardTitle>
              <div className="flex gap-0.5">
                {["1d", "1s", "1m", "6m"].map((period, i) => (
                  <Button
                    key={period}
                    variant={i === 1 ? "flat" : "flat-ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <EmptyState
                icon={BarChart3}
                title="Sem dados para exibir"
                description="O gráfico aparecerá após as primeiras execuções"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
