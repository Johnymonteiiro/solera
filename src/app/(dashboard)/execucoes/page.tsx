import { ExecucoesView } from "@/components/dashboard/execucoes-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar
        title="Execuções"
        subtitle="pipeline dos agentes"
        actions={<RefreshButton />}
      />
      <div className="flex-1 overflow-y-auto p-7">
        <ExecucoesView />
      </div>
    </>
  );
}
