/**
 * HierarchyViewSkeleton — layout-shaped skeleton shown while the dynamic
 * HierarchyView bundle (d3-hierarchy) is loading.
 *
 * Used as the `loading:` fallback in the dynamic() import in
 * FormaProposalClient, and optionally re-exported for use elsewhere.
 *
 * No "use client" required — pure markup (no hooks, no effects).
 *
 * Plan: 06-04 (FRM-01)
 */

export function HierarchyViewSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      {/* Top row: role picker placeholder */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-28 animate-pulse rounded-md bg-muted/20" />
        <div className="h-6 w-20 animate-pulse rounded-md bg-muted/20" />
      </div>

      {/* Tree root node */}
      <div className="flex flex-col gap-2 pl-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-muted/30" />
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted/20" />
        </div>

        {/* Level 1 branches */}
        <div className="ml-4 flex flex-col gap-2 border-l border-muted/20 pl-4">
          {[60, 80, 50, 70].map((w, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted/30" />
                <div
                  className="h-4 animate-pulse rounded-md bg-muted/20"
                  style={{ width: `${w}px` }}
                />
              </div>
              {/* Level 2 children (shown for first two branches) */}
              {i < 2 && (
                <div className="ml-3 flex flex-col gap-1 border-l border-muted/15 pl-3">
                  {[40, 55].map((cw, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-muted/20" />
                      <div
                        className="h-3.5 animate-pulse rounded bg-muted/15"
                        style={{ width: `${cw}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Connector-line hint at the bottom */}
      <div className="mt-auto flex items-center gap-2 opacity-50">
        <div className="h-px flex-1 animate-pulse bg-muted/20" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted/15" />
        <div className="h-px flex-1 animate-pulse bg-muted/20" />
      </div>
    </div>
  );
}
