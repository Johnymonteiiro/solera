import { EstudoView } from "@/components/dashboard/estudo-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";
import { requireAreaPage } from "@/lib/dal";

export default async function Page() {
  // A matriz de acesso decide (padrão: colaborador para cima). As rotas de
  // export checam a mesma área por conta própria — esta guarda é a da página.
  await requireAreaPage("estudo");

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
