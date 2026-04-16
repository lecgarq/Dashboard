// app/api/chat/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { listChatSpaces, pollLatestMessage } from "@/lib/google/chat";
import { createLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
const logger = createLogger("chat-stream-route");

const POLL_INTERVAL_MS = 5000; // 5s — lighter with pageSize:1 polling
const HEARTBEAT_INTERVAL_MS = 20000;
const MAX_SPACES_TO_POLL = 10; // Only check the most recent 10 spaces

type NewMessageEvent = {
  type: "new_message";
  spaceName: string;
  spaceDisplayName: string;
  message: {
    name: string;
    senderDisplayName: string;
    senderAvatarUrl: string | null;
    text: string;
    createTime: string;
  };
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const signal = req.signal;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const lastSeenTime = new Map<string, string>();

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const sendEvent = (event: NewMessageEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      };

      const poll = async () => {
        if (closed) return;
        try {
          const spacesResult = await listChatSpaces(userId);
          if (spacesResult.status !== "ok") return;

          const activeSpaces = spacesResult.spaces.slice(0, MAX_SPACES_TO_POLL);

          // Poll spaces sequentially in batches of 3 to avoid burst quota hits
          for (let i = 0; i < activeSpaces.length; i += 3) {
            if (closed) break;
            const batch = activeSpaces.slice(i, i + 3);

            await Promise.all(
              batch.map(async (space) => {
                if (closed) return;

                try {
                  const result = await pollLatestMessage(userId, space.name);
                  if (result.status !== "ok" || !result.message) return;

                  const msg = result.message;
                  const lastSeen = lastSeenTime.get(space.name);

                  // Update the last seen time
                  lastSeenTime.set(space.name, msg.createTime);

                  // Skip if this is the initial seed or not newer
                  if (!lastSeen || msg.createTime <= lastSeen) return;

                  logger.debug("New message detected in polled space", {
                    spaceName: space.name,
                    spaceDisplayName: space.displayName,
                  });

                  sendEvent({
                    type: "new_message",
                    spaceName: space.name,
                    spaceDisplayName: space.displayName,
                    message: {
                      name: msg.name,
                      senderDisplayName: msg.sender.displayName,
                      senderAvatarUrl: msg.sender.avatarUrl ?? null,
                      text: msg.text,
                      createTime: msg.createTime,
                    },
                  });
                } catch (err) {
                  logger.warn("Failed to poll space for latest message", {
                    spaceName: space.name,
                    spaceDisplayName: space.displayName,
                    error: err,
                  });
                }
              })
            );
          }
        } catch (err) {
          logger.warn("Chat stream poll failed", {
            userId,
            error: err,
          });
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Flush immediately so proxies don't buffer
      send("retry: 5000\n\n");

      // Initial poll to seed lastSeenTime (don't emit on first run)
      void poll();

      const pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS);
      const heartbeatInterval = setInterval(
        () => send(": keep-alive\n\n"),
        HEARTBEAT_INTERVAL_MS
      );

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
