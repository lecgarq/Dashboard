import { cn } from "@/lib/core/utils";

/**
 * GraphLoadingSkeleton — loading placeholder for the spatial-graph / access
 * analysis surface. Mirrors the real layout (slider sidebar + toolbar + canvas)
 * and previews the graph's *actual* sunflower seeding so the placeholder reads
 * unmistakably as "a node graph is loading".
 *
 * Positions are computed at module scope with NO randomness (golden-angle
 * sunflower) so the server and client render byte-identical markup — avoiding a
 * React hydration mismatch when used inside a route-level `loading.tsx`.
 *
 * Pure presentational (no hooks/handlers) → safe in both server `loading.tsx`
 * and the client shell's loading branch.
 */

const NODE_COUNT = 48;
const GOLDEN_ANGLE = 2.399963229728653; // radians — same constant the graph uses

const NODES = Array.from({ length: NODE_COUNT }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / NODE_COUNT) * 40; // up to 40% of canvas radius
  const theta = i * GOLDEN_ANGLE;
  return {
    left: 50 + r * Math.cos(theta),
    top: 50 + r * Math.sin(theta),
    size: 6 + ((i * 7) % 10), // 6..15px — varied node sizes
    delay: (i * 90) % 1400, // staggered twinkle (ms)
  };
});

export function GraphLoadingSkeleton({
  className,
  message = "Loading graph…",
}: {
  className?: string;
  message?: string;
}): React.JSX.Element {
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

        {/* canvas with node cloud */}
        <div className="relative flex-1 overflow-hidden">
          {/* soft brand glow behind the cloud */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

          {/* the node cloud */}
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

          {/* centered status pill */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center gap-3 rounded-full border border-border/50 bg-card/80 px-5 py-2.5 shadow-soft-xl backdrop-blur-md">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {message}
              </span>
            </div>
          </div>

          {/* shimmer sweep across the canvas */}
          <div className="pointer-events-none absolute inset-0 animate-shimmer opacity-60" />
        </div>
      </div>
    </div>
  );
}
