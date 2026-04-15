# Google Chat Panel — Integrated Slide-Out Drawer

**Date:** 2026-04-07
**Status:** Design approved

## Overview

Replace the current popup-based Google Chat integration (`ChatPanel.tsx`) with a native slide-out drawer that uses the existing tRPC + Google Chat API backend to render spaces and messages directly inside the dashboard.

## Architecture

### Layout & Interaction

- **Trigger:** Floating action button (FAB) in the bottom-right corner (same position as current).
- **Drawer:** Fixed-position panel, ~400px wide, full viewport height, slides in from the right with a semi-transparent backdrop overlay. Does not push main content.
- **Close:** X button in header, clicking the backdrop, or pressing Escape.
- **Internal navigation:** Two views — space list (default) and conversation view — navigated via a back button.

### Space List View (default)

- Header: "Google Chat" title + close (X) button.
- Renders all spaces from `chat.getSpaces` — DMs, group chats, and rooms together, sorted by API default order.
- Each item shows `displayName` and a space type icon (DM vs group/room).
- Clicking a space navigates to the conversation view.
- Polling: `refetchInterval: 30_000` (30 seconds).
- Empty state: "No chat spaces found" with a link to open Google Chat in a new tab.
- No Google account: prompt to link via `signIn("google")`.

### Conversation View

- Header: back arrow + space `displayName` + close (X) button.
- Messages rendered in a scrollable list, newest at the bottom.
- Each message: sender avatar (or initials fallback), sender name, relative timestamp, message text.
- Own messages visually distinguished (right-aligned or highlighted) by comparing `sender.name` against the current user.
- Auto-scroll: scrolls to bottom on initial load and on new messages, but only if user is already at the bottom.
- Compose bar at the bottom: text input + send button. Enter to send, Shift+Enter for newline.
- Polling: `refetchInterval: 5_000` (5 seconds) for the active space. Stops when drawer closes or user navigates back to space list.
- Loading state: skeleton/spinner on initial load.

### Real-Time Strategy

Short-interval polling using tRPC `refetchInterval`:
- Spaces: every 30 seconds.
- Messages (active space only): every 5 seconds.

Google Chat API does not support user-scoped push notifications, so polling is the only viable approach without heavy Workspace admin infrastructure.

## Files Changed

| File | Change |
|------|--------|
| `components/dashboard/ChatPanel.tsx` | Complete rewrite — drawer, space list, conversation views |
| `components/dashboard/ChatPanelWrapper.tsx` | No changes |
| `app/(dashboard)/layout.tsx` | No changes |
| `server/routers/chat.ts` | No changes |
| `lib/google-chat.ts` | No changes |

No new files. No new dependencies. Single-file rewrite of `ChatPanel.tsx` using existing tRPC hooks (`trpc.chat.getSpaces`, `trpc.chat.getMessages`, `trpc.chat.sendMessage`).

## Access

Any authenticated user with a linked Google account sees the chat FAB. Users without a linked Google account see a prompt to link one.
