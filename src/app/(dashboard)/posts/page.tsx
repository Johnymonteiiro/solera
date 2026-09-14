import { PostsView } from "@/components/dashboard/posts-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";
import { requireAreaPage } from "@/lib/dal";

export default async function Page() {
  await requireAreaPage("posts");

  return (
    <>
      {/* O "Criar post" que ficava aqui saiu: a Topbar passou a renderizar o
          atalho em todas as telas (NovoPostButton), e os dois juntos deixavam
          dois botões roxos idênticos lado a lado neste header. */}
      <Topbar
        title="Posts"
        subtitle="posts gerados pelos agentes"
        actions={<RefreshButton />}
      />
      <div className="flex-1 overflow-y-auto p-7">
        <PostsView />
      </div>
    </>
  );
}
