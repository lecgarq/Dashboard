"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fetch-failure state for the lazy per-tab loaders. Distinct from the honest
 * empty state ("no rows") and from PanelErrorBoundary (render crashes): this
 * one names the failed load and offers a retry, so a network drop never
 * masquerades as "no data".
 */
export function LoadFailedNotice({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-background/50 p-8 text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm text-foreground">
        Couldn&apos;t load {what}.{" "}
        <span className="text-muted-foreground">The data is unchanged — this was a fetch failure, not missing data.</span>
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="h-8 gap-2 text-xs">
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}

/**
 * Page-level counterpart for the EAGER server fan-out (mainCharts.tsx). That
 * fan-out settles per-loader instead of all-or-nothing, so a single failed
 * source degrades to an honest empty panel rather than replacing the whole
 * surface with the framework error page. This banner is what makes that
 * degradation visible — without it, a failed source is indistinguishable from
 * "no data", which is the exact lie the workshop cannot afford.
 *
 * Retry is a server re-fetch (router.refresh()), not a client callback: the
 * failed loaders ran on the server, so only a new render can re-run them.
 */
export function SourcesFailedBanner({ sources }: { sources: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (sources.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <p className="text-sm text-foreground">
        Couldn&apos;t load {sources.join(", ")}.{" "}
        <span className="text-muted-foreground">
          Panels fed by {sources.length === 1 ? "it" : "them"} are empty because the fetch failed, not because the data is
          missing.
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="ml-auto h-8 gap-2 text-xs"
      >
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
        {pending ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
