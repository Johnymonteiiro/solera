import { PostDetail } from "@/components/dashboard/post-detail";
import { Topbar } from "@/components/dashboard/topbar";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return (
    <>
      <Topbar title="Detalhe do post" subtitle={threadId} />
      <div className="flex-1 overflow-y-auto p-7">
        <PostDetail threadId={threadId} />
      </div>
    </>
  );
}
