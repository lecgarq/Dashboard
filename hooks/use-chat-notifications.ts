// hooks/use-chat-notifications.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventSource } from "@/hooks/use-event-source";
import { useChatPanel } from "@/components/dashboard/chat-panel-context";
import {
  primeSoundEngine,
  queueNotificationSound,
  requestBrowserNotificationPermission,
  warmSoundEngine,
} from "@/lib/sound-engine";
import { trpc } from "@/lib/core/trpc";

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
  const { open, view, navigateTo } = useChatPanel();
  const utils = trpc.useUtils();
  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  const openRef = useRef(open);
  openRef.current = open;
  const viewRef = useRef(view);
  viewRef.current = view;

  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    primeSoundEngine();
    warmSoundEngine();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    requestBrowserNotificationPermission();
  }, [enabled]);

  const handleMessage = useCallback(
    (event: NewMessageEvent) => {
      if (event.type !== "new_message") return;

      const messageId = event.message.name;
      if (processedIdsRef.current.has(messageId)) return;
      processedIdsRef.current.add(messageId);
      if (processedIdsRef.current.size > 50) {
        const firstId = processedIdsRef.current.values().next().value;
        if (firstId) processedIdsRef.current.delete(firstId);
      }

      setUnreadMap((prev) => {
        const next = new Map(prev);
        next.set(event.spaceName, (next.get(event.spaceName) ?? 0) + 1);
        return next;
      });

      void utils.chat.getMessages.invalidate({
        spaceName: event.spaceName,
      });
      void utils.chat.getSpaces.invalidate();

      const isViewingThis =
        openRef.current &&
        viewRef.current.type === "conversation" &&
        viewRef.current.spaceName === event.spaceName;

      if (!isViewingThis) {
        queueNotificationSound("chat");
      }

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
