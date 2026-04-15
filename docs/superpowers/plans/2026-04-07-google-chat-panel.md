# Google Chat Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup-based Google Chat button with a native slide-out drawer that renders spaces and messages using the existing tRPC + Google Chat API backend.

**Architecture:** Single-file rewrite of `ChatPanel.tsx` into a drawer with two views (space list, conversation). Uses existing `chatRouter` tRPC endpoints with `refetchInterval` for polling. One prerequisite fix: register `chatRouter` in the root router.

**Tech Stack:** React, tRPC React Query hooks, Tailwind CSS, Lucide icons, next-auth session

---

### Task 1: Register chatRouter in root router

**Files:**
- Modify: `server/routers/root.ts`

The `chatRouter` exists in `server/routers/chat.ts` but is not registered in the root router, so `trpc.chat.*` calls will fail.

- [ ] **Step 1: Add chat import and register**

In `server/routers/root.ts`, add the import and register it:

```typescript
import { chatRouter } from "./chat";

export const appRouter = router({
  project: projectRouter,
  families: familiesRouter,
  clash: clashRouter,
  exam: examRouter,
  kpi: kpiRouter,
  tasks: tasksRouter,
  search: searchRouter,
  users: usersRouter,
  trello: trelloRouter,
  sim: simRouter,
  calendar: calendarRouter,
  chat: chatRouter,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to chat router.

- [ ] **Step 3: Commit**

```bash
git add server/routers/root.ts
git commit -m "feat: register chatRouter in root tRPC router"
```

---

### Task 2: Rewrite ChatPanel — Drawer shell and space list

**Files:**
- Modify: `components/dashboard/ChatPanel.tsx`

This task builds the drawer container and the space list view. The conversation view comes in Task 3.

- [ ] **Step 1: Write the drawer shell with space list**

Replace the entire contents of `components/dashboard/ChatPanel.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import {
  ArrowLeft,
  Link2,
  Loader2,
  MessageCircle,
  Send,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";

type View = { type: "spaces" } | { type: "conversation"; spaceName: string; displayName: string };

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "spaces" });
  const { hasGoogle } = useDashboardAuth();

  const close = () => {
    setOpen(false);
    // Reset to spaces list when closing so it's fresh on reopen
    setTimeout(() => setView({ type: "spaces" }), 300);
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* FAB */}
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

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 transition-opacity"
          onClick={close}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 z-[70] h-full w-[400px] max-w-[90vw]",
          "bg-card border-l border-border shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {!hasGoogle ? (
          <LinkGooglePrompt onClose={close} />
        ) : view.type === "spaces" ? (
          <SpaceListView
            onClose={close}
            onSelectSpace={(spaceName, displayName) =>
              setView({ type: "conversation", spaceName, displayName })
            }
          />
        ) : (
          <ConversationView
            spaceName={view.spaceName}
            displayName={view.displayName}
            onBack={() => setView({ type: "spaces" })}
            onClose={close}
          />
        )}
      </div>
    </>
  );
}

/* ─── Link Google Prompt ─── */

function LinkGooglePrompt({ onClose }: { onClose: () => void }) {
  return (
    <>
      <DrawerHeader title="Google Chat" onClose={onClose} />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <MessageCircle size={48} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Link your Google account to use Chat.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: window.location.href })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Link2 size={14} />
          Link Google Account
        </button>
      </div>
    </>
  );
}

/* ─── Drawer Header ─── */

function DrawerHeader({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="h-14 flex items-center gap-2 px-4 border-b border-border shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
      )}
      <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
      <button
        onClick={onClose}
        className="p-1.5 rounded-md hover:bg-muted transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/* ─── Space List View ─── */

function SpaceListView({
  onClose,
  onSelectSpace,
}: {
  onClose: () => void;
  onSelectSpace: (spaceName: string, displayName: string) => void;
}) {
  const { data: spaces, isLoading } = trpc.chat.getSpaces.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <>
      <DrawerHeader title="Google Chat" onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : !spaces?.length ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center p-6">
            <p className="text-sm text-muted-foreground">No chat spaces found.</p>
            <a
              href="https://chat.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Open Google Chat
            </a>
          </div>
        ) : (
          <div className="py-1">
            {spaces.map((space) => (
              <button
                key={space.name}
                onClick={() => onSelectSpace(space.name, space.displayName)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {space.spaceType === "DIRECT_MESSAGE" ? (
                    <MessageCircle size={16} className="text-primary" />
                  ) : (
                    <Users size={16} className="text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{space.displayName}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {space.spaceType === "DIRECT_MESSAGE"
                      ? "Direct message"
                      : space.spaceType?.toLowerCase().replace("_", " ") ?? "Space"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Conversation View (placeholder for Task 3) ─── */

function ConversationView({
  spaceName,
  displayName,
  onBack,
  onClose,
}: {
  spaceName: string;
  displayName: string;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <DrawerHeader title={displayName} onClose={onClose} onBack={onBack} />
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ChatPanel.tsx
git commit -m "feat: rewrite ChatPanel as slide-out drawer with space list"
```

---

### Task 3: Implement conversation view with messages and compose

**Files:**
- Modify: `components/dashboard/ChatPanel.tsx`

Replace the placeholder `ConversationView` function with the full implementation.

- [ ] **Step 1: Replace the ConversationView function**

Replace the `ConversationView` function (the placeholder at the bottom of the file) with:

```tsx
function ConversationView({
  spaceName,
  displayName,
  onBack,
  onClose,
}: {
  spaceName: string;
  displayName: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { user } = useDashboardAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const wasAtBottomRef = useRef(true);

  const { data, isLoading } = trpc.chat.getMessages.useQuery(
    { spaceName },
    { refetchInterval: 5_000 }
  );

  const utils = trpc.useUtils();
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setInput("");
      utils.chat.getMessages.invalidate({ spaceName });
    },
  });

  const messages = data?.messages ?? [];

  // Track whether user is scrolled to bottom
  const checkIfAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Auto-scroll to bottom on new messages if user was at bottom
  useEffect(() => {
    if (wasAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMessage.isPending) return;
    sendMessage.mutate({ spaceName, text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Determine if a message is from the current user.
  // Google Chat sender.name is "users/{id}" — compare against session user's name/email as fallback.
  const isOwnMessage = (senderDisplayName: string) => {
    if (!user) return false;
    return senderDisplayName === user.name || senderDisplayName === user.email;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <DrawerHeader title={displayName} onClose={onClose} onBack={onBack} />

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={checkIfAtBottom}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const own = isOwnMessage(msg.sender.displayName);
            return (
              <div
                key={msg.name}
                className={cn("flex gap-2", own && "flex-row-reverse")}
              >
                {/* Avatar */}
                {!own && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    {msg.sender.avatarUrl ? (
                      <img
                        src={msg.sender.avatarUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-primary">
                        {msg.sender.displayName[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                  </div>
                )}
                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[75%] rounded-xl px-3 py-2",
                    own
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  )}
                >
                  {!own && (
                    <p className="text-[11px] font-semibold text-foreground/70 mb-0.5">
                      {msg.sender.displayName}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                  <p
                    className={cn(
                      "text-[10px] mt-1",
                      own ? "text-white/60" : "text-muted-foreground/60"
                    )}
                  >
                    {formatTime(msg.createTime)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose bar */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2",
              "text-sm placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-1 focus:ring-primary/50",
              "max-h-24 overflow-y-auto"
            )}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className={cn(
              "p-2.5 rounded-lg transition-colors shrink-0",
              input.trim() && !sendMessage.isPending
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {sendMessage.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add missing imports if needed**

The `useRef`, `useState`, `useEffect` imports and `useDashboardAuth`, `trpc` imports should already be at the top of the file from Task 2. Verify no new imports are needed — all types (`Loader2`, `Send`, `ArrowLeft`, `X`, `Users`, `MessageCircle`) were imported in Task 2.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/ChatPanel.tsx
git commit -m "feat: implement conversation view with messages and compose"
```

---

### Task 4: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the flow**

1. Open the dashboard in the browser
2. Click the blue chat FAB in the bottom-right corner
3. Verify the drawer slides in from the right with the space list
4. Click a space — verify messages load and display
5. Send a message — verify it appears after the next poll
6. Press Escape — verify the drawer closes
7. Click the backdrop — verify the drawer closes
8. Click the FAB again — verify it opens to the space list (not the last conversation)

- [ ] **Step 3: Test edge cases**

1. Log in as a user without Google linked — verify the "Link Google Account" prompt appears
2. Verify Shift+Enter creates a newline in the compose box
3. Scroll up in a conversation, wait for poll — verify it does NOT auto-scroll you down
4. Scroll to bottom, wait for poll with new messages — verify it DOES auto-scroll

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add components/dashboard/ChatPanel.tsx
git commit -m "fix: address issues found during smoke test"
```
