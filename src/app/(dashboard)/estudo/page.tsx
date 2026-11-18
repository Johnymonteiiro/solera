import { CorpusPanel } from "@/components/dashboard/corpus-panel";
import { requireAreaPage } from "@/lib/dal";

// Estudo › Dados: o corpus (v1 de cada execução), filtrado pelo modelo do Writer.
export default async function Page() {
  // A matriz de acesso decide (padrão: colaborador para cima). As rotas de
  // export checam a mesma área por conta própria — esta guarda é a da página.
  await requireAreaPage("estudo");
  return <CorpusPanel />;
}
