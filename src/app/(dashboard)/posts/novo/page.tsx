import {
  CriarPostAction,
  CriarPostProvider,
  CriarPostView,
} from "@/components/dashboard/criar-post-view";
import { Topbar } from "@/components/dashboard/topbar";

// O provider embrulha a Topbar E o corpo porque a ação primária vive no header
// e o formulário no corpo — são irmãos, e o estado do formulário é o mesmo que
// habilita o botão. `Ctx.Provider` não gera nó no DOM, então o flex do layout
// continua valendo.
export default function Page() {
  return (
    <CriarPostProvider>
      <Topbar
        title="Criar post"
        subtitle="pesquisa + pipeline dos agentes"
        actions={<CriarPostAction />}
        hideNovoPost
      />
      {/* A tela ocupa a altura toda: as três superfícies (pipeline, post e
          estatísticas) rolam por dentro, e a página não rola por fora — senão o
          pipeline sai de vista justo enquanto está andando. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-7">
        <CriarPostView />
      </div>
    </CriarPostProvider>
  );
}
