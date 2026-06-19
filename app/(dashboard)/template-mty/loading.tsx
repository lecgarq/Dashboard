/**
 * Route-level skeleton for /template-mty rendered by Next.js Suspense while
 * the page SSR data loads. Matches the page's actual section layout:
 *   • A header / stat-strip area
 *   • Three tall analytics panels (role pie, permission bar, module bar)
 * (~200ms skeleton target — PERF-01)
 */
export default function TemplateMtyLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      {/* Page header + stat strip */}
      <div className="space-y-3">
        <div className="h-7 w-56 rounded-lg bg-muted/20 animate-pulse" />
        <div className="h-4 w-80 rounded-md bg-muted/20 animate-pulse" />
      </div>

      {/* Primary chart panels — mirrors the 3-section layout on the real page */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Role pie panel */}
        <div className="rounded-2xl bg-muted/20 animate-pulse" style={{ height: 420 }} />

        {/* Permission bar panel */}
        <div className="rounded-2xl bg-muted/20 animate-pulse" style={{ height: 280 }} />
      </div>

      {/* Module bar panel — full-width */}
      <div className="rounded-2xl bg-muted/20 animate-pulse" style={{ height: 260 }} />

      {/* Members table placeholder */}
      <div className="rounded-2xl bg-muted/20 animate-pulse" style={{ height: 340 }} />
    </div>
  );
}
