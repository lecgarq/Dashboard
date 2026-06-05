"use client";
import type { CoordinationSummary } from "../coordinationCounts";

const BAR = "#38bdf8"; // sky — echoes the former Model Coordination donut color

export function CoordinationByProject({
  summary,
  accessibleProjects,
  forbiddenProjects,
}: {
  summary: CoordinationSummary;
  accessibleProjects: number;
  forbiddenProjects: number;
}) {
  const { total, byProject, byStatus } = summary;
  const max = byProject[0]?.count ?? 1;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <header className="mb-3 flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Model Coordination · clash-validated issues
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">clash-validated issues</span>
        </div>
      </header>

      {byStatus.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {byStatus.map((s) => (
            <span key={s.status} className="rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {s.status}
            </span>
          ))}
        </div>
      )}

      {byProject.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coordination issues in the selected projects.</p>
      ) : (
        <ul className="list-none space-y-1" style={{ columnWidth: "300px", columnGap: "1.5rem" }}>
          {byProject.map((p) => {
            const pct = max > 0 ? (p.count / max) * 100 : 0;
            return (
              <li
                key={p.projectId}
                className="relative flex items-center gap-2 overflow-hidden break-inside-avoid rounded-md px-2 py-1 text-xs"
              >
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${pct}%`, background: BAR, opacity: 0.16 }} />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BAR }} />
                <span className="relative flex-1 truncate text-foreground/85" title={p.projectName}>{p.projectName}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{p.count.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      )}

      {forbiddenProjects > 0 && (
        <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground/70">
          Based on {accessibleProjects} accessible projects. {forbiddenProjects} projects could not be scanned due to credentials.
        </p>
      )}
    </div>
  );
}
