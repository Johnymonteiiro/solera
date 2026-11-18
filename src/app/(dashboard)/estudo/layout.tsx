import { EstudoSubnav } from "@/components/dashboard/estudo-subnav";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";

// Área de estudo: topo comum + subsidebar (Dados, Benchmarks). A guarda de
// acesso fica em cada página — layout não protege rota filha sozinho.
export default function EstudoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar
        title="Estudo"
        subtitle="O Judge é um gate confiável?"
        actions={<RefreshButton />}
      />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <EstudoSubnav />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-7">{children}</div>
      </div>
    </>
  );
}
