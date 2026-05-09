import { NextRequest } from "next/server";
import { SSE_KEEPALIVE_MS } from "@/app/MAS/constants";
import { subscribeToThread } from "@/app/MAS/lib/threadStore";
import { StatusEvent } from "@/app/MAS/types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;

      const write = (event: StatusEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const keepalive = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(":\n\n"));
      }, SSE_KEEPALIVE_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      unsubscribe = subscribeToThread(threadId, (event) => {
        write(event);
        if (event.type === "done" || event.type === "error") close();
      });

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
