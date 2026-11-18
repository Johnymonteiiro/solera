import { ModelosView } from "@/components/dashboard/modelos-view";
import { Topbar } from "@/components/dashboard/topbar";
import { requireAreaPage } from "@/lib/dal";

// Mesma área de /agentes: é config do pipeline, e ler/gravar segue a mesma regra
// (ler = área `agentes`, gravar = admin na rota).
export default async function Page() {
  await requireAreaPage("agentes");

  return (
    <>
      <Topbar title="Modelos" subtitle="quem escreve os posts (OpenRouter)" />
      <div className="flex-1 overflow-y-auto p-7">
        <ModelosView />
      </div>
    </>
  );
}
