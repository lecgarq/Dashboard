/**
 * NA-01 — Activity Coverage Badge.
 * Renders an inline "Activity: N / M projects" pill so activity-derived panels
 * surface their coverage honestly. RSC-safe (no "use client" required — pure
 * presentational; accepts pre-computed counts from the caller).
 *
 * Counts should be derived via activityCoverageCounts(coverage) from
 * app/(dashboard)/access-analysis/coverageCounts.ts — do NOT hardcode.
 */
export function ActivityCoverageBadge({
  covered,
  total,
  className,
}: {
  covered: number;
  total: number;
  className?: string;
}) {
  return (
    <span
      data-testid="activity-coverage-badge"
      title={`Activity data is available for ${covered.toLocaleString()} of ${total.toLocaleString()} ACC projects.`}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground${className ? ` ${className}` : ""}`}
    >
      {covered > 0 && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-success"
        />
      )}
      Activity:{" "}
      <span>
        {covered.toLocaleString()} / {total.toLocaleString()} projects
      </span>
    </span>
  );
}
