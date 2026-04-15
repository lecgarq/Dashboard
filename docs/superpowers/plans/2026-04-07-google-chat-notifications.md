# Real-Time Google Chat Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace client-side polling with server-sent events (SSE), add browser desktop notifications for every new message, and show an unread badge on the chat FAB.

**Architecture:** A new SSE endpoint (`/api/chat/stream`) polls Google Chat every 3s per connected user and pushes `new_message` events to the client. A React hook consumes the stream, fires browser notifications, manages unread counts, and invalidates tRPC queries. Chat panel state is lifted into a context so notification clicks can open specific conversations.

**Tech Stack:** Next.js API routes (ReadableStream SSE), React Context, Web Notifications API, existing `googleapis` + tRPC infrastructure

---

### Task 1: Create ChatPanelContext for lifted state

**Files:**
- Create: `components/dashboard/chat-panel-context.tsx`

This context lifts the `open` and `view` state out of `ChatPanel` so that notification click handlers and the chat panel can share state.

- [ ] **Step 1: Create the context file**

```tsx
// components/dashboard/chat-panel-context.tsx
"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

type SpaceSelection = {
  spaceName: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  spaceType?: string | null;
};

type View = { type: "spaces" } | ({ type: "conversation" } & SpaceSelection);

type ChatPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  view: View;
  setView: (view: View) => void;
  navigateTo: (spaceName: string, displayName: string) => void;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "spaces" });

  const navigateTo = useCallback((spaceName: string, displayName: string) => {
    setView({ type: "conversation", spaceName, displayName });
    setOpen(true);
  }, []);

  const value = useMemo<ChatPanelContextValue>(
    () => ({ open, setOpen, view, setView, navigateTo }),
    [open, view, navigateTo]
  );

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>;
}

export function useChatPanel() {
  const context = useContext(ChatPanelContext);
  if (!context) {
    throw new Error("useChatPanel must be used within ChatPanelProvider");
  }
  return context;
}

export type { View as ChatPanelView, SpaceSelection };
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to chat-panel-context.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/chat-panel-context.tsx
git commit -m "feat: add ChatPanelContext for lifted drawer state"
```

---

### Task 2: Create SSE endpoint for chat stream

**Files:**
- Create: `app/api/chat/stream/route.ts`

This endpoint authenticates the user, polls Google Chat every 3s, and pushes `new_message` events via SSE. It follows the same SSE pattern as the existing `app/api/events/users/route.ts`.

- [ ] **Step 1: Create the SSE route**

```ts
// app/api/chat/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { listChatSpaces, listChatMessages } from "@/lib/google-chat";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 20000;

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
        send(`event: new_message\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const poll = async () => {
        if (closed) return;
        try {
          const spacesResult = await listChatSpaces(userId);
          if (spacesResult.status !== "ok") return;

          for (const space of spacesResult.spaces) {
            if (closed) return;

            const messagesResult = await listChatMessages(userId, space.name);
            if (messagesResult.status !== "ok" || messagesResult.messages.length === 0) continue;

            const lastSeen = lastSeenTime.get(space.name);
            const newMessages = lastSeen
              ? messagesResult.messages.filter((msg) => msg.createTime > lastSeen)
              : [];

            // On first poll, just record the latest time — don't emit events
            const latestMessage = messagesResult.messages[messagesResult.messages.length - 1];
            if (latestMessage) {
              lastSeenTime.set(space.name, latestMessage.createTime);
            }

            for (const msg of newMessages) {
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
            }
          }
        } catch (err) {
          console.warn("[Chat Stream] poll error:", err);
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
      send("retry: 3000\n\n");

      // Initial poll to seed lastSeenTime
      void poll();

      const pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS);
      const heartbeatInterval = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_INTERVAL_MS);

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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to chat/stream.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/stream/route.ts
git commit -m "feat: add SSE endpoint for real-time chat message streaming"
```

---

### Task 3: Add notification sound

**Files:**
- Create: `public/notification.mp3`

We need a short notification sound file. Generate a minimal valid MP3 or use a royalty-free notification chime.

- [ ] **Step 1: Download or generate a notification sound**

Use a base64-encoded minimal notification beep. Create the file at `public/notification.mp3`. A simple approach — use a royalty-free sound from a CDN or generate one:

```bash
# Option A: Use a short royalty-free beep (engineer should source a ~0.5s notification chime)
# Place the file at public/notification.mp3
# Any short MP3 notification sound works — keep it under 50KB
```

If no MP3 is available, the implementation in Task 4 uses a try/catch around `Audio.play()` so the feature degrades gracefully (notifications still appear, just without sound).

- [ ] **Step 2: Commit**

```bash
git add public/notification.mp3
git commit -m "feat: add notification sound for chat messages"
```

---

### Task 4: Create use-chat-notifications hook

**Files:**
- Create: `hooks/use-chat-notifications.ts`

This hook connects to the SSE endpoint, manages unread state, fires browser notifications, and invalidates tRPC queries.

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-chat-notifications.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventSource } from "@/hooks/use-event-source";
import { useChatPanel } from "@/components/dashboard/chat-panel-context";
import { trpc } from "@/lib/trpc";

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

export function useChatNotifications(enabled: boolean) {
  const [unreadMap, setUnreadMap] = useState<Map<string, number>>(new Map());
  const { navigateTo } = useChatPanel();
  const utils = trpc.useUtils();
  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  // Request notification permission on mount
  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [enabled]);

  const handleMessage = useCallback(
    (event: NewMessageEvent) => {
      if (event.type !== "new_message") return;

      // 1. Update unread count
      setUnreadMap((prev) => {
        const next = new Map(prev);
        next.set(event.spaceName, (next.get(event.spaceName) ?? 0) + 1);
        return next;
      });

      // 2. Invalidate tRPC queries
      void utils.chat.getSpaces.invalidate();
      void utils.chat.getMessages.invalidate({ spaceName: event.spaceName });

      // 3. Fire browser notification
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const notification = new Notification(event.message.senderDisplayName, {
            body: event.message.text.slice(0, 200),
            icon: event.message.senderAvatarUrl ?? undefined,
            tag: event.spaceName,
          });

          notification.onclick = () => {
            window.focus();
            navigateToRef.current(event.spaceName, event.spaceDisplayName);
            notification.close();
          };
        } catch {
          // Notification API may fail in some contexts (e.g. insecure origin)
        }
      }

      // 4. Play notification sound
      try {
        const audio = new Audio("/notification.mp3");
        audio.volume = 0.5;
        void audio.play();
      } catch {
        // Sound playback may be blocked by browser autoplay policy
      }
    },
    [utils]
  );

  useEventSource<NewMessageEvent>("/api/chat/stream", handleMessage, enabled);

  const unreadSpaceCount = unreadMap.size > 0
    ? Array.from(unreadMap.values()).filter((count) => count > 0).length
    : 0;

  const clearUnread = useCallback((spaceName: string) => {
    setUnreadMap((prev) => {
      const next = new Map(prev);
      next.delete(spaceName);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setUnreadMap(new Map());
  }, []);

  return { unreadSpaceCount, clearUnread, clearAll };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to use-chat-notifications.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-chat-notifications.ts
git commit -m "feat: add useChatNotifications hook with SSE, unread state, and browser notifications"
```

---

### Task 5: Wire ChatPanelWrapper with context and notifications

**Files:**
- Modify: `components/dashboard/ChatPanelWrapper.tsx`

Wrap the dynamic `ChatPanel` import with `ChatPanelProvider` and add the notifications hook.

- [ ] **Step 1: Update ChatPanelWrapper**

Replace the entire contents of `components/dashboard/ChatPanelWrapper.tsx` with:

```tsx
// components/dashboard/ChatPanelWrapper.tsx
"use client";

import dynamic from "next/dynamic";
import { ChatPanelProvider } from "@/components/dashboard/chat-panel-context";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { useChatNotifications } from "@/hooks/use-chat-notifications";

const ChatPanel = dynamic(
  () => import("@/components/dashboard/ChatPanel").then((m) => m.ChatPanel),
  { ssr: false }
);

function ChatPanelInner() {
  const { hasGoogleChat } = useDashboardAuth();
  const { unreadSpaceCount, clearUnread } = useChatNotifications(hasGoogleChat);

  return <ChatPanel unreadSpaceCount={unreadSpaceCount} clearUnread={clearUnread} />;
}

export function ChatPanelWrapper() {
  return (
    <ChatPanelProvider>
      <ChatPanelInner />
    </ChatPanelProvider>
  );
}
```

- [ ] **Step 2: Verify it compiles (expect temporary error)**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: May show errors because `ChatPanel` doesn't accept `unreadSpaceCount`/`clearUnread` props yet — this is fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ChatPanelWrapper.tsx
git commit -m "feat: wire ChatPanelProvider and notifications into ChatPanelWrapper"
```

---

### Task 6: Update ChatPanel to consume context, show badge, and clear unread

**Files:**
- Modify: `components/dashboard/ChatPanel.tsx`

Changes:
1. Accept `unreadSpaceCount` and `clearUnread` props
2. Replace local `open`/`view` state with `useChatPanel()` context
3. Add unread badge to the FAB
4. Remove `refetchInterval` from tRPC queries (SSE handles freshness)
5. Call `clearUnread(spaceName)` when opening a conversation

- [ ] **Step 1: Update the ChatPanel component**

At the top of the file, add the import for the context hook. Find this import block:

```tsx
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { startOAuthConnect } from "@/lib/oauth-connect";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { useChatPanel, type SpaceSelection } from "@/components/dashboard/chat-panel-context";
import { startOAuthConnect } from "@/lib/oauth-connect";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Remove the local SpaceSelection type and View type**

Find and remove these lines (they are now exported from chat-panel-context):

```tsx
type SpaceSelection = {
  spaceName: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  spaceType?: string | null;
};

type View = { type: "spaces" } | ({ type: "conversation" } & SpaceSelection);
```

- [ ] **Step 3: Update the ChatPanel function signature and body**

Find:

```tsx
export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "spaces" });
  const { hasGoogleChat } = useDashboardAuth();

  const close = () => {
    setOpen(false);
    setTimeout(() => setView({ type: "spaces" }), 300);
  };
```

Replace with:

```tsx
export function ChatPanel({
  unreadSpaceCount = 0,
  clearUnread,
}: {
  unreadSpaceCount?: number;
  clearUnread?: (spaceName: string) => void;
}) {
  const { open, setOpen, view, setView } = useChatPanel();
  const { hasGoogleChat } = useDashboardAuth();

  const close = () => {
    setOpen(false);
    setTimeout(() => setView({ type: "spaces" }), 300);
  };
```

- [ ] **Step 4: Add the unread badge to the FAB**

Find the FAB button:

```tsx
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-[#1a73e8] text-white hover:scale-110 hover:bg-[#1557b0]",
          open && "pointer-events-none opacity-0"
        )}
        title="Open Google Chat"
      >
        <MessageCircle size={20} />
      </button>
```

Replace with:

```tsx
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-[#1a73e8] text-white hover:scale-110 hover:bg-[#1557b0]",
          open && "pointer-events-none opacity-0"
        )}
        title="Open Google Chat"
      >
        <MessageCircle size={20} />
        {unreadSpaceCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none shadow-md">
            {unreadSpaceCount > 9 ? "9+" : unreadSpaceCount}
          </span>
        )}
      </button>
```

- [ ] **Step 5: Wire clearUnread when selecting a space**

Find the `onSelectSpace` callback in the SpaceListView usage:

```tsx
          <SpaceListView
            onClose={close}
            onSelectSpace={(space) => setView({ type: "conversation", ...space })}
          />
```

Replace with:

```tsx
          <SpaceListView
            onClose={close}
            onSelectSpace={(space) => {
              setView({ type: "conversation", ...space });
              clearUnread?.(space.spaceName);
            }}
          />
```

- [ ] **Step 6: Remove refetchInterval from SpaceListView**

Find in `SpaceListView`:

```tsx
  const { data, error, isLoading } = trpc.chat.getSpaces.useQuery(undefined, {
    refetchInterval: 30_000,
  });
```

Replace with:

```tsx
  const { data, error, isLoading } = trpc.chat.getSpaces.useQuery();
```

- [ ] **Step 7: Remove refetchInterval from ConversationView**

Find in `ConversationView`:

```tsx
  const { data, error, isLoading } = trpc.chat.getMessages.useQuery(
    { spaceName },
    { refetchInterval: 5_000 }
  );
```

Replace with:

```tsx
  const { data, error, isLoading } = trpc.chat.getMessages.useQuery(
    { spaceName }
  );
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/ChatPanel.tsx
git commit -m "feat: consume ChatPanelContext, add unread badge, remove polling intervals"
```

---

### Task 7: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test SSE connection**

1. Open the dashboard, ensure Google Chat is linked
2. Open browser DevTools > Network tab, filter by "EventStream"
3. Verify `/api/chat/stream` connects and stays open
4. Wait ~10 seconds — verify heartbeat comments appear in the stream

- [ ] **Step 3: Test notifications**

1. When prompted, allow notifications
2. Send a message from another Google Chat client (phone/web)
3. Verify: browser notification appears with sender name and message text
4. Verify: notification sound plays
5. Click the notification — verify dashboard tab focuses and drawer opens to that conversation

- [ ] **Step 4: Test unread badge**

1. Close the chat drawer
2. Receive a message from another client
3. Verify: red badge appears on the FAB with count "1"
4. Receive messages from a different space
5. Verify: badge increments to "2"
6. Open the drawer and click into a conversation
7. Verify: badge decrements (unread cleared for that space)

- [ ] **Step 5: Test edge cases**

1. Close and reopen the drawer — verify it opens to space list (not stale conversation)
2. Disconnect network briefly — verify SSE reconnects (EventSource auto-reconnects)
3. Test with a user that has no Google Chat linked — verify no SSE connection attempted, no errors
4. Verify Escape and backdrop click still close the drawer

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```
