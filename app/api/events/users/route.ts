
import { NextRequest } from "next/server";
import userEvents from "@/lib/user-events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const signal = req.signal;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const sendChunk = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const listener = (event: any) => {
        sendChunk(`data: ${JSON.stringify(event)}\n\n`);
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        userEvents.off("user-update", listener);
        signal.removeEventListener("abort", cleanup);
        try { controller.close(); } catch { /* already closed */ }
      };

      userEvents.on("user-update", listener);

      // Flush immediately so proxies don't buffer the stream
      sendChunk("retry: 1000\n\n");

      // Heartbeat to keep connection alive
      const interval = setInterval(() => {
        sendChunk(": keep-alive\n\n");
      }, 20000);

      signal.addEventListener("abort", cleanup);
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
