import { DashboardPipelineCard } from "@/components/dashboard/dashboard-pipeline-card";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { PostsAreaChart } from "@/components/dashboard/posts-area-chart";
import { RecentExecutionsList } from "@/components/dashboard/recent-executions-list";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="visão geral do sistema"
        actions={<RefreshButton />}
      />

      <div className="flex-1 overflow-y-auto p-7">
        <div className="flex flex-col gap-6">
          {/* KPI grid */}
          <KpiGrid />

          {/* Two-col: execuções + pipeline */}
          <div className="grid grid-cols-[1fr_380px] gap-3.5 max-[1100px]:grid-cols-1">
            {/* Execuções recentes */}
            <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-0">
              <CardHeader className="flex-row items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                  Execuções recentes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <RecentExecutionsList />
              </CardContent>
            </Card>

            {/* Pipeline ativo */}
            <DashboardPipelineCard />
          </div>

          {/* Posts gerados */}
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0 gap-0">
            <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                Posts gerados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <PostsAreaChart />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
