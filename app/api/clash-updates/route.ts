import clashEvents, { type ClashEvent } from "@/lib/clash-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 20_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const sendChunk = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const handler = (payload: ClashEvent) => {
        sendChunk(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        clashEvents.off("update", handler);
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      clashEvents.on("update", handler);
      sendChunk("retry: 1000\n\n");

      heartbeat = setInterval(() => {
        sendChunk(`: keep-alive ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", cleanup);
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
