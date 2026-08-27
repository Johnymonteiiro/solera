import { EstudoView } from "@/components/dashboard/estudo-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar
        title="Estudo"
        subtitle="A revisão do agente melhora o post?"
        actions={<RefreshButton />}
      />
      <div className="flex-1 overflow-y-auto p-7">
        <EstudoView />
      </div>
    </>
  );
}
