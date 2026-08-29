import { Topbar } from "@/components/dashboard/topbar"

import { requireAreaPage } from "@/lib/dal";
export default async function Page() {
  await requireAreaPage("traces");

  return (
    <>
      <Topbar title="Langsmith" />
      <div className="flex-1 p-7">
        <p className="text-[var(--text-muted)] text-sm">Em construção.</p>
      </div>
    </>
  )
}
