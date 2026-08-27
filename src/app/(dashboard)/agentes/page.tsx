import { AgentesView } from "@/components/dashboard/agentes-view";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar title="Configurar agentes" subtitle="papéis, prompts e on/off" />
      <div className="flex-1 overflow-y-auto p-7">
        <AgentesView />
      </div>
    </>
  );
}
