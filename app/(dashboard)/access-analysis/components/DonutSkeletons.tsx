import { Skeleton } from "@/components/ui/skeleton";
import { PremiumSurface } from "@/components/ui/PremiumSurface";

/**
 * Shaped shimmer skeletons for the Access Analysis page Suspense fallbacks.
 * All variants use the `animate-shimmer` class and the `--shimmer-stop` token
 * for a consistent 200ms shimmer feel.
 */

/**
 * A single donut-ring shimmer: circular outer ring with a card-bg center hole.
 *
 * Shell-free on purpose — it renders inside the tab's own PremiumSurface, and a
 * second `.panel-elevated` there would nest a card inside a card (and stack two
 * hover lifts). Standalone callers wrap it themselves; see DonutGridSkeleton.
 */
export function DonutPanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Section header shimmer */}
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-40 animate-shimmer rounded-md" />
        <Skeleton className="h-3.5 w-64 animate-shimmer rounded-md" />
      </div>
      {/* Donut ring shimmer: outer disc with a center hole */}
      <div className="flex items-center justify-center py-4">
        <div className="relative h-44 w-44">
          <Skeleton className="h-44 w-44 animate-shimmer rounded-full" />
          {/* Center hole — uses bg-card to punch out the ring shape */}
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card" />
        </div>
      </div>
      {/* Legend row shimmers */}
      <div className="flex flex-col gap-2">
        {[80, 64, 72].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 animate-shimmer rounded-full" />
            <Skeleton className={`h-3 w-${w === 80 ? "[80px]" : w === 64 ? "[64px]" : "[72px]"} animate-shimmer rounded-md`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A 2-up grid of DonutPanelSkeletons for the page-level Suspense fallback.
 * This one IS the outermost surface (no tab panel above it), so it supplies the
 * card that DonutPanelSkeleton no longer carries — matching the geometry of the
 * PremiumSurface panels it stands in for.
 */
export function DonutGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
        <DonutPanelSkeleton />
      </PremiumSurface>
      <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
        <DonutPanelSkeleton />
      </PremiumSurface>
    </div>
  );
}

/** KPI strip shimmer — a row of ~6 stat-tile placeholders matching StatStrip geometry. */
export function KpiStripSkeleton() {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="panel-elevated flex min-w-[120px] flex-1 flex-col gap-1.5 rounded-2xl p-4"
        >
          <Skeleton className="h-3 w-20 animate-shimmer rounded-md" />
          <Skeleton className="h-7 w-14 animate-shimmer rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Timeline section shimmer — a card with horizontal bar placeholders. */
export function TimelineSkeleton() {
  return (
    <div className="panel-elevated flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-48 animate-shimmer rounded-md" />
        <Skeleton className="h-3.5 w-72 animate-shimmer rounded-md" />
      </div>
      {/* Chart area: axis + bars */}
      <div className="flex h-[220px] flex-col justify-end gap-1 pb-4">
        {[40, 65, 55, 80, 45, 70, 60, 90, 50, 75, 85, 55].map((pct, i) => (
          <Skeleton
            key={i}
            className="animate-shimmer rounded-sm"
            style={{ height: `${pct}%`, width: `${Math.round(100 / 12)}%`, marginLeft: `${i * Math.round(100 / 12)}%`, position: "absolute" }}
          />
        ))}
        <Skeleton className="h-full w-full animate-shimmer rounded-xl opacity-20" />
      </div>
    </div>
  );
}
