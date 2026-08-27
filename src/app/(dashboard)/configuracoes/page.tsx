import { ConfiguracoesView } from "@/components/dashboard/configuracoes-view";
import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar title="Configurações" subtitle="chaves de API e redes sociais" />
      <div className="flex-1 overflow-y-auto p-7">
        <ConfiguracoesView />
      </div>
    </>
  );
}
