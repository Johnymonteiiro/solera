import { Topbar } from "@/components/dashboard/topbar";
import { UsuariosView } from "@/components/dashboard/usuarios-view";
import { requireAreaPage } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Área `users` na matriz — por padrão só admin.
  const { ownerId } = await requireAreaPage("users");

  return (
    <>
      <Topbar title="Usuários" subtitle="contas, atividade e acesso" />
      <div className="flex-1 overflow-y-auto p-7">
        <UsuariosView meuId={ownerId} />
      </div>
    </>
  );
}
