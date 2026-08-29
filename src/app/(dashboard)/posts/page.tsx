import { PostsView } from "@/components/dashboard/posts-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { requireAreaPage } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAreaPage("posts");

  return (
    <>
      <Topbar
        title="Posts"
        subtitle="posts gerados pelos agentes"
        actions={
          <>
            <RefreshButton />
            <Button asChild color="purple" size="sm">
              <Link href="/posts/novo">
                <Plus size={14} /> Criar post
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-7">
        <PostsView />
      </div>
    </>
  );
}
