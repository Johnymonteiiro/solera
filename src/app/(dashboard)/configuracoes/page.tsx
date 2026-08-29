import { ConfiguracoesView } from "@/components/dashboard/configuracoes-view";
import { Topbar } from "@/components/dashboard/topbar";
import { requireAreaPage } from "@/lib/dal";

export default async function Page() {
  // Área `config` na matriz — por padrão só admin. Quem tiver acesso concedido
  // mas não for admin vê a config em somente-leitura e sem o painel de
  // permissões. Papel e id descem como prop porque já estamos no servidor.
  const { ownerId, role } = await requireAreaPage("config");

  return (
    <>
      <Topbar
        title="Configurações"
        subtitle="chaves de API, redes sociais e permissões"
      />
      <div className="flex-1 overflow-y-auto p-7">
        <ConfiguracoesView role={role} meuId={ownerId} />
      </div>
    </>
  );
}
