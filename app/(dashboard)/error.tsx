"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError } from "@/lib/chunk-load-error";
import { clientLogger } from "@/lib/core/logger";

const RETRY_KEY = (path: string) => `chunk_retry_${path}`;
const AUTO_RETRY_WINDOW_MS = 15_000;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRetried, setAutoRetried] = useState(false);

  const isChunk = isChunkLoadError(error);

  useEffect(() => {
    if (!isChunk) {
      clientLogger.error("[DashboardError]", error);
      return;
    }

    const key = RETRY_KEY(window.location.pathname);
    const lastRetryAt = Number(sessionStorage.getItem(key) ?? "0");

    // Auto-reload once per path inside a short time window. This covers stale
    // or dropped chunks without risking an endless reload loop when the public
    // tunnel is actually down.
    if (!lastRetryAt || Number.isNaN(lastRetryAt) || Date.now() - lastRetryAt > AUTO_RETRY_WINDOW_MS) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
      return;
    }

    setAutoRetried(true);
  }, [isChunk, error]);

  if (isChunk && !autoRetried) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8 text-center">
      <div className="bg-card p-5 rounded-3xl border border-border/50 shadow-soft-xl">
        <AlertCircle className="w-12 h-12 text-destructive/70" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold text-foreground">
          {isChunk ? "Component failed to load" : "Something went wrong"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isChunk
            ? "The page bundle still could not be fetched after an automatic retry. The public tunnel or a fresh rebuild may have invalidated the chunk."
            : error.message || "An unexpected error occurred."}
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => { sessionStorage.removeItem(RETRY_KEY(window.location.pathname)); window.location.reload(); }} className="gap-2">
          <RefreshCw size={15} />
          Reload page
        </Button>
        {!isChunk && (
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
