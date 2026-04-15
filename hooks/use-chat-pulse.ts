"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

interface NewMessageEvent {
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

export function useChatPulse(onNewMessage?: (event: NewMessageEvent) => void) {
  const utils = trpc.useUtils();
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    function connect() {
      if (typeof window === "undefined") return;
      
      console.log("[Chat Pulse] Connecting to live stream...");
      eventSource = new EventSource("/api/chat/stream");

      eventSource.onmessage = (event) => {
        try {
          const data: NewMessageEvent = JSON.parse(event.data);
          
          if (data.type === "new_message") {
            const messageId = data.message.name;
            
            // Deduplicate using a Set to handle multiple messages in bursts
            if (processedIdsRef.current.has(messageId)) return;
            processedIdsRef.current.add(messageId);
            
            // Keep the set small (last 50 IDs)
            if (processedIdsRef.current.size > 50) {
              const firstId = processedIdsRef.current.values().next().value;
              if (firstId) processedIdsRef.current.delete(firstId);
            }

            console.log(`[Chat Pulse] New message in ${data.spaceDisplayName}`);
            
            // 1. Invalidate both spaces and messages to refresh the UI
            void utils.chat.getSpaces.invalidate();
            void utils.chat.getMessages.invalidate({ spaceName: data.spaceName });
            
            // 2. Trigger sound/notification callback
            onNewMessage?.(data);
          }
        } catch (err) {
          console.error("[Chat Pulse] Failed to parse message event:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn("[Chat Pulse] Stream error, attempting reconnect...", err);
        eventSource?.close();
        
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(connect, 3000 * retryCount);
        }
      };
    }

    connect();

    return () => {
      eventSource?.close();
    };
  }, [utils, onNewMessage]);
}
