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

// ─── Web Audio Notification Sound ────────────────────────────────────────────
// Uses Web Audio API — no mp3 file needed. Auto-primes on first user interaction.

let _audioCtx: AudioContext | null = null;
let _pingChain: Promise<void> = Promise.resolve();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new Ctor() as AudioContext;
  }
  return _audioCtx;
}

/** Auto-prime AudioContext on first user gesture (click/keydown anywhere). */
function autoPrimeAudioContext() {
  if (typeof window === "undefined") return;

  const prime = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Remove after first interaction
    window.removeEventListener("click", prime, true);
    window.removeEventListener("keydown", prime, true);
  };

  window.addEventListener("click", prime, true);
  window.addEventListener("keydown", prime, true);
}

function enqueuePing(): void {
  _pingChain = _pingChain.then(() => playOnePing());
}

function playOnePing(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ctx = _audioCtx;
    if (!ctx) return resolve();

    if (ctx.state !== "running") {
      // Try to resume, then play
      ctx
        .resume()
        .then(() => {
          if (ctx.state === "running") playPingNow(ctx, resolve);
          else resolve();
        })
        .catch(() => resolve());
      return;
    }
    playPingNow(ctx, resolve);
  });
}

function playPingNow(ctx: AudioContext, done: () => void): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
  // Space pings 250ms apart so bursts of messages each get their own sound
  setTimeout(done, 250);
}

// ─────────────────────────────────────────────────────────────────────────────

export function useChatNotifications(enabled: boolean) {
  const [unreadMap, setUnreadMap] = useState<Map<string, number>>(new Map());
  const { open, view, navigateTo } = useChatPanel();
  const utils = trpc.useUtils();
  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  // Refs for current panel state so the SSE callback can read them without re-subscribing
  const openRef = useRef(open);
  openRef.current = open;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Deduplication set (keeps last 50 message IDs)
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Auto-prime audio context on mount
  useEffect(() => {
    if (!enabled) return;
    autoPrimeAudioContext();
    getAudioContext(); // Pre-create context
  }, [enabled]);

  // Request notification permission on mount
  useEffect(() => {
    if (!enabled) return;
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }, [enabled]);

  const handleMessage = useCallback(
    (event: NewMessageEvent) => {
      if (event.type !== "new_message") return;

      // Deduplicate
      const messageId = event.message.name;
      if (processedIdsRef.current.has(messageId)) return;
      processedIdsRef.current.add(messageId);
      if (processedIdsRef.current.size > 50) {
        const firstId = processedIdsRef.current.values().next().value;
        if (firstId) processedIdsRef.current.delete(firstId);
      }

      // 1. Update unread count
      setUnreadMap((prev) => {
        const next = new Map(prev);
        next.set(
          event.spaceName,
          (next.get(event.spaceName) ?? 0) + 1
        );
        return next;
      });

      // 2. Invalidate tRPC queries
      void utils.chat.getMessages.invalidate({
        spaceName: event.spaceName,
      });
      void utils.chat.getSpaces.invalidate();

      // 3. Determine if user is currently viewing this conversation
      const isViewingThis =
        openRef.current &&
        viewRef.current.type === "conversation" &&
        viewRef.current.spaceName === event.spaceName;

      // 4. Play notification sound (unless viewing this conversation)
      if (!isViewingThis) {
        enqueuePing();
      }

      // 5. Fire browser notification (unless viewing this conversation)
      if (
        !isViewingThis &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(
            event.message.senderDisplayName,
            {
              body: event.message.text.slice(0, 200),
              icon: event.message.senderAvatarUrl ?? undefined,
              tag: event.spaceName,
            }
          );

          notification.onclick = () => {
            window.focus();
            navigateToRef.current(
              event.spaceName,
              event.spaceDisplayName
            );
            notification.close();
          };
        } catch {
          // Notification API may fail in some contexts
        }
      }
    },
    [utils]
  );

  useEventSource<NewMessageEvent>(
    "/api/chat/stream",
    handleMessage,
    enabled
  );

  const unreadSpaceCount =
    unreadMap.size > 0
      ? Array.from(unreadMap.values()).filter((count) => count > 0).length
      : 0;

  const getUnreadCount = useCallback(
    (spaceName: string) => unreadMap.get(spaceName) ?? 0,
    [unreadMap]
  );

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

  return { unreadSpaceCount, getUnreadCount, clearUnread, clearAll };
}
