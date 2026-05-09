import { ExecucoesView } from "@/components/dashboard/execucoes-view";
import { ModalPost } from "@/components/dashboard/modal-post";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar
        title="Execuções"
        subtitle="pipeline dos agentes"
        actions={<ModalPost />}
      />
      <div className="flex-1 overflow-y-auto p-7">
        <ExecucoesView />
      </div>
    </>
  );
}
