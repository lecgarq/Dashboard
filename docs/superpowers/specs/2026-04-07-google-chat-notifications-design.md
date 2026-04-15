# Real-Time Google Chat Notifications — Design Spec

**Date:** 2026-04-07
**Status:** Design approved

## Overview

Add real-time notifications to the existing Google Chat panel. Replace client-side polling with server-sent events (SSE), add browser/desktop notifications for every new message, and show an unread badge on the chat FAB.

## Requirements

1. **SSE-based real-time updates** — server polls Google Chat every ~3s per connected user, pushes new messages to the client via SSE
2. **Browser notifications** — every new message triggers a desktop notification with sender name, message preview, avatar, and default notification sound
3. **Notification click** — focuses the dashboard tab, opens the chat drawer, and navigates to the relevant conversation
4. **Unread badge** — numeric count of spaces with unread messages displayed on the chat FAB (red pill, max "9+")
5. **Permission handling** — request Notification permission once on mount; silently skip if denied

## Architecture

### SSE Endpoint

**Route:** `app/api/chat/stream/route.ts`

A Next.js route handler that returns a `ReadableStream` with `text/event-stream` content type.

**Behavior:**
- Authenticates the user via session (reuses existing auth)
- On connection, fetches all spaces via `listChatSpaces`, then fetches the latest message per space
- Stores `lastSeenMessageTime` per space in memory (Map keyed by space name)
- Every 3 seconds, re-fetches messages for all spaces, compares `createTime` against `lastSeenMessageTime`
- New messages are pushed as SSE events
- On client disconnect, the polling loop stops and cleans up

**Event shape:**
```ts
{
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
}
```

### Client SSE Hook & State Management

**File:** `hooks/use-chat-notifications.ts`

- Connects to `/api/chat/stream` via the existing `useEventSource` hook
- Manages unread state: `Map<spaceName, unreadCount>`
- Exposes:
  - `unreadSpaceCount: number` — count of spaces with unread messages (for badge)
  - `clearUnread(spaceName: string)` — called when user opens a conversation
  - `clearAll()` — resets all unread counts
- On each `new_message` event:
  1. Fires a browser notification
  2. Increments unread count for that space
  3. Invalidates tRPC queries (`chat.getSpaces`, `chat.getMessages`) so the UI updates immediately

**Polling removal:** The existing `refetchInterval` on tRPC queries (5s for messages, 30s for spaces) is removed. SSE-triggered invalidation replaces polling.

### Browser Notifications

Triggered inside `use-chat-notifications.ts` on each `new_message` event.

**Flow:**
1. On hook mount, request `Notification.permission` if status is `"default"`
2. On each new message: `new Notification(senderDisplayName, { body: text, icon: senderAvatarUrl, tag: spaceName })`
   - `tag: spaceName` collapses multiple notifications from the same space
3. Play notification sound: `new Audio("/notification.mp3").play()`
4. On notification click: call `navigateTo(spaceName, spaceDisplayName)` from ChatPanelContext, focus window

**Permission handling:**
- `"default"` — request once on mount
- `"denied"` — silently skip (badge still works)
- No repeated prompts

### Unread Badge

Rendered on the FAB in `ChatPanel.tsx`.

- Visible when `unreadSpaceCount > 0` and drawer is closed
- Red pill badge, white text, top-right of FAB
- Shows numeric count; "9+" for counts above 9

### Chat Panel State Lifting

**File:** `components/dashboard/chat-panel-context.tsx`

Context provides:
```ts
{
  open: boolean;
  setOpen: (open: boolean) => void;
  navigateTo: (spaceName: string, displayName: string) => void;
  view: View;
  setView: (view: View) => void;
}
```

- `ChatPanelWrapper.tsx` provides this context
- `ChatPanel.tsx` consumes it instead of local state
- `use-chat-notifications.ts` consumes `navigateTo` for notification click handling
- `navigateTo` sets `open: true` and `view: { type: "conversation", spaceName, displayName }`

## Files

| File | Action | Purpose |
|------|--------|---------|
| `app/api/chat/stream/route.ts` | New | SSE endpoint, server-side 3s polling |
| `hooks/use-chat-notifications.ts` | New | SSE consumer, unread state, browser notifications |
| `components/dashboard/chat-panel-context.tsx` | New | Lifted panel open/view state |
| `components/dashboard/ChatPanel.tsx` | Modify | Consume context, add unread badge, remove polling intervals, wire clearUnread |
| `components/dashboard/ChatPanelWrapper.tsx` | Modify | Provide ChatPanelContext |
| `public/notification.mp3` | New | Short notification sound |

## Non-Goals

- Google Workspace admin-level push notifications (Pub/Sub topics) — too much infrastructure for internal dashboard
- Shared polling worker / Redis pub/sub — overkill for current user count
- Notification preferences UI — all notifications on by default
- Offline/service worker push notifications

## Dependencies

No new npm packages. Uses existing `googleapis`, `useEventSource` hook, tRPC utils, and Web Notifications API.
