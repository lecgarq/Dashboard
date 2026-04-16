// hooks/use-mail-notifications.ts
"use client";

import { useEffect, useRef, useState } from "react";
import {
  primeSoundEngine,
  queueNotificationSound,
  requestBrowserNotificationPermission,
  warmSoundEngine,
} from "@/lib/sound-engine";
import { trpc } from "@/lib/core/trpc";

export function useMailNotifications(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isWindowVisible, setIsWindowVisible] = useState(true);
  const lastIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    primeSoundEngine();
    warmSoundEngine();
    requestBrowserNotificationPermission();
  }, [enabled]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncVisibility = () => {
      setIsWindowVisible(document.visibilityState !== "hidden");
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const { data: messages } = trpc.gmail.getRecent.useQuery(
    { maxResults: 10 },
    {
      enabled,
      refetchInterval: isWindowVisible ? 15000 : 60000,
      staleTime: isWindowVisible ? 10000 : 55000,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    if (!messages) return;

    if (messages.length === 0) {
      setUnreadCount(0);
      lastIdRef.current = null;
      isFirstLoadRef.current = false;
      return;
    }

    const unreads = messages.filter((message) => message.isUnread).length;
    setUnreadCount(unreads);

    const newestMessage = messages[0];
    if (newestMessage.id !== lastIdRef.current) {
      lastIdRef.current = newestMessage.id;

      if (!isFirstLoadRef.current && newestMessage.isUnread) {
        queueNotificationSound("mail");

        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`New Mail: ${newestMessage.subject}`, {
              body: newestMessage.from,
              icon: "/favicon.ico",
              tag: "new_gmail",
            });
          } catch {
            // Notification API may fail in some contexts
          }
        }
      }

      isFirstLoadRef.current = false;
    }
  }, [messages]);

  return { unreadCount };
}
