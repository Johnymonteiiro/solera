import { BenchmarkView } from "@/components/dashboard/benchmark-view";
import { requireAreaPage } from "@/lib/dal";

// Estudo › Benchmarks: comparação entre os modelos do Writer.
export default async function Page() {
  await requireAreaPage("estudo");
  return <BenchmarkView />;
}
