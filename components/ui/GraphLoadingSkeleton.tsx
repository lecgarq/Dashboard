"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/core/utils";

/**
 * GraphLoadingSkeleton — loading placeholder for the spatial-graph / access
 * analysis surface. Mirrors the real layout (slider sidebar + toolbar + canvas),
 * shows a live elapsed timer + progress so a slow first load is never a mystery,
 * and draws the cloud as ORGANIC CLUSTERS (not a circular disc).
 *
 * Node positions are computed at module scope with NO randomness so server and
 * client render identical markup (no hydration mismatch); only the timer is
 * client state and starts at 0 on both sides.
 */

// A few organic cluster centers (percent of canvas) with deterministic scatter
// — reads as "grouped network", never a filled circle.
const CLUSTERS = [
  { cx: 36, cy: 40, r: 15 },
  { cx: 62, cy: 35, r: 13 },
  { cx: 52, cy: 60, r: 17 },
  { cx: 30, cy: 64, r: 11 },
  { cx: 72, cy: 62, r: 12 },
];
const NODE_COUNT = 70;
const GOLDEN = 2.399963229728653;

const NODES = Array.from({ length: NODE_COUNT }, (_, i) => {
  const c = CLUSTERS[i % CLUSTERS.length];
  const a = i * GOLDEN;
  const rad = Math.sqrt(((i * 41) % 100) / 100) * c.r; // deterministic radial scatter
  return {
    left: c.cx + Math.cos(a) * rad,
    top: c.cy + Math.sin(a) * rad,
    size: 5 + ((i * 7) % 9),
    delay: (i * 70) % 1500,
  };
});

export function GraphLoadingSkeleton({
  className,
  message = "Loading graph…",
  /** Rough upper bound used only to pace the progress bar; the screen unmounts
   *  the instant the real graph is ready, so over-/under-estimating is harmless. */
  estimateSeconds = 15,
}: {
  className?: string;
  message?: string;
  estimateSeconds?: number;
}): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsedMs(performance.now() - start), 200);
    return () => clearInterval(id);
  }, []);

  const elapsed = elapsedMs / 1000;
  // Asymptotic fill — approaches but never reaches 100% until the graph swaps in.
  const pct = Math.min(96, (elapsed / estimateSeconds) * 100);
  const slow = elapsed > 4;

  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden animate-in fade-in duration-300",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      {/* Left: slider sidebar shell */}
      <div className="hidden w-64 shrink-0 flex-col gap-5 border-r border-border/50 p-4 md:flex">
        <div className="h-5 w-32 animate-pulse rounded-md bg-accent" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-accent" />
            <div className="h-2 w-full animate-pulse rounded-full bg-accent/60" />
          </div>
        ))}
      </div>

      {/* Right: toolbar + canvas */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* toolbar shell */}
        <div className="flex items-center gap-2 border-b border-border/50 p-3">
          <div className="h-8 w-28 animate-pulse rounded-lg bg-accent" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-accent" />
          <div className="ml-auto h-8 w-24 animate-pulse rounded-lg bg-accent" />
        </div>

        {/* canvas with organic node clusters */}
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

          {NODES.map((n, i) => (
            <span
              key={i}
              className="absolute animate-pulse rounded-full bg-accent"
              style={{
                left: `${n.left}%`,
                top: `${n.top}%`,
                width: `${n.size}px`,
                height: `${n.size}px`,
                transform: "translate(-50%, -50%)",
                animationDelay: `${n.delay}ms`,
              }}
            />
          ))}

          {/* centered status card: message + live timer + progress + ETA copy */}
          <div className="absolute left-1/2 top-1/2 w-[20rem] max-w-[80%] -translate-x-1/2 -translate-y-1/2">
            <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/85 px-5 py-4 shadow-soft-xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {message}
                </span>
                <span className="ml-auto tabular-nums text-xs font-bold text-primary">
                  {Math.floor(elapsed)}s
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-[11px] leading-snug text-muted-foreground/70">
                {slow
                  ? "First load builds your full access dataset (~17,000 users). This can take ~15s — later loads are instant."
                  : "Preparing your access graph…"}
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 animate-shimmer opacity-50" />
        </div>
      </div>
    </div>
  );
}
