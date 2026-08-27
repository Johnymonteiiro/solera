import { CriarPostView } from "@/components/dashboard/criar-post-view";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar title="Criar post" subtitle="pesquisa + pipeline dos agentes" />
      <div className="flex-1 overflow-y-auto p-7">
        <CriarPostView />
      </div>
    </>
  );
}
