import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getRole, requireOwner } from "@/lib/dal";
import { getAccessMatrix } from "@/lib/permissions";
import { AREA_IDS, Area, DEFAULT_ROLE } from "@/lib/roles";

// Server Component: cobre as 14 páginas do grupo de uma vez.
//
// Camada de UX, NÃO de segurança — não substitui o escopo por dono dos stores
// nem as checagens nas rotas de API, que é onde o dado realmente é servido.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwner();
  // O papel desce como prop em vez de a sidebar buscá-lo: já estamos no
  // servidor, e um fetch a mais só para decidir quais links pintar seria
  // desperdício. Esconder link não é permissão — cada página e rota checa.
  const role = (await getRole()) ?? DEFAULT_ROLE;

  // Quais áreas esta pessoa alcança — a sidebar só pinta o que existe para ela.
  // Admin não consulta a matriz: alcança tudo por definição.
  const matrix = await getAccessMatrix();
  const areas: Area[] =
    role === "admin" ? AREA_IDS : AREA_IDS.filter((a) => matrix[role][a]);

  return (
    <SidebarProvider>
      <AppSidebar areas={areas} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </SidebarProvider>
  );
}
