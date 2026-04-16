"use client";

import { useEffect, useRef } from "react";
import { clientLogger } from "@/lib/core/logger";

/**
 * Subscribe to a Server-Sent Events endpoint with automatic reconnection.
 *
 * @param url - The SSE endpoint URL
 * @param onMessage - Callback invoked with parsed JSON data for each message
 * @param enabled - Whether the subscription is active (default: true)
 */
export function useEventSource<T = unknown>(
  url: string,
  onMessage: (data: T) => void,
  enabled = true
) {
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const MAX_RETRIES = 10;
    const BASE_DELAY_MS = 2000;
    const MAX_DELAY_MS = 30000;

    function connect() {
      if (disposed) return;

      clientLogger.log("[SSE] Connecting to", url);
      source = new EventSource(url);

      source.onopen = () => {
        clientLogger.log("[SSE] Connected");
        retryCount = 0; // Reset on successful connection
      };

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          callbackRef.current(data);
        } catch {
          // ignore malformed messages
        }
      };

      source.onerror = () => {
        clientLogger.warn("[SSE] Connection error, will reconnect...");
        source?.close();
        source = null;

        if (disposed) return;

        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY_MS * Math.pow(1.5, retryCount), MAX_DELAY_MS);
          clientLogger.log(`[SSE] Retry #${retryCount + 1} in ${Math.round(delay / 1000)}s`);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        } else {
          clientLogger.error("[SSE] Max retries reached. Waiting for visibility change to retry.");
        }
      };
    }

    // Reconnect when tab becomes visible again (handles sleep/idle disconnect)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !disposed) {
        // If the source is closed or we've exhausted retries, reconnect
        if (!source || source.readyState === EventSource.CLOSED) {
          clientLogger.log("[SSE] Tab visible again, reconnecting...");
          retryCount = 0;
          connect();
        }
      }
    }

    connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      source?.close();
      source = null;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [url, enabled]);
}
