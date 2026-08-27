import { FerramentasView } from "@/components/dashboard/ferramentas-view";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar title="Ferramentas" subtitle="tools dos agentes" />
      <div className="flex-1 overflow-y-auto p-7">
        <FerramentasView />
      </div>
    </>
  );
}
