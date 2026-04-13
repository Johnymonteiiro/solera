import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </SidebarProvider>
  );
}
