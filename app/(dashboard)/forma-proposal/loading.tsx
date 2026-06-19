/**
 * Route-level skeleton rendered by Next.js Suspense while /forma-proposal loads.
 *
 * Layout-shaped: left rail placeholder + right tree/canvas placeholder area,
 * reaching the ~200ms skeleton target (PERF-01 / CONTEXT.md FRM-02 loading decision).
 *
 * Mirrors the container/structure conventions of app/(dashboard)/users/loading.tsx.
 *
 * Plan: 06-04 (FRM-02)
 */
export default function FormaProposalLoading(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-32 animate-pulse rounded-md bg-muted/20" />
          <div className="hidden h-4 w-48 animate-pulse rounded-full bg-muted/15 lg:block" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-md bg-muted/20" />
          <div className="h-7 w-16 animate-pulse rounded-md bg-muted/15" />
          <div className="h-7 w-16 animate-pulse rounded-md bg-muted/15" />
          <div className="h-7 w-16 animate-pulse rounded-md bg-muted/15" />
        </div>
      </div>

      {/* Body: rail + editor area */}
      <div className="flex min-h-0 flex-1">
        {/* Left role rail skeleton */}
        <div className="flex w-48 shrink-0 flex-col gap-2 border-r border-border/60 p-3">
          {/* Rail header */}
          <div className="mb-1 flex items-center justify-between">
            <div className="h-3.5 w-12 animate-pulse rounded bg-muted/20" />
            <div className="h-6 w-6 animate-pulse rounded-md bg-muted/15" />
          </div>
          {/* Role items */}
          {[70, 90, 55, 80, 65, 75].map((w, i) => (
            <div
              key={i}
              className="flex h-8 items-center gap-2 rounded-md px-2"
            >
              <div className="h-2 w-2 animate-pulse rounded-full bg-muted/25" />
              <div
                className="h-3.5 animate-pulse rounded bg-muted/20"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>

        {/* Right tree/canvas placeholder */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {/* Section header */}
          <div className="flex flex-col gap-1 border-b border-border/60 pb-3">
            <div className="h-4 w-36 animate-pulse rounded-md bg-muted/20" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted/15" />
          </div>

          {/* Tree placeholders */}
          <div className="flex flex-col gap-2 pl-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-muted/30" />
              <div className="h-5 w-44 animate-pulse rounded-md bg-muted/20" />
            </div>
            <div className="ml-4 flex flex-col gap-2 border-l border-muted/20 pl-4">
              {[65, 85, 50, 75, 60].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted/25" />
                  <div
                    className="h-4 animate-pulse rounded-md bg-muted/20"
                    style={{ width: `${w}%`, maxWidth: "160px" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
