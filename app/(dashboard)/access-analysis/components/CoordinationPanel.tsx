"use client";
import type { CoordinationSummary } from "@/lib/server/coordinationView";

export function CoordinationPanel({ summary }: { summary: CoordinationSummary }) {
  const { coordinationCount, validatedCount, byStatus, byProject, auditCount, accessibleProjects, forbiddenProjects } = summary;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-foreground">
      <header className="mb-3 flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          Model Coordination
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{coordinationCount}</span>
          <span className="text-sm text-muted-foreground">clash-generated issues</span>
        </div>
        <span className="text-xs text-muted-foreground">{validatedCount} validated by clash data</span>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {byStatus.map((s) => (
          <span key={s.status} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {s.status}: <span className="font-medium text-foreground tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>

      <ol className="flex flex-col gap-1 text-sm">
        {byProject.map((p) => (
          <li key={p.projectId} className="flex justify-between gap-3">
            <span className="truncate text-muted-foreground">{p.projectName}</span>
            <span className="tabular-nums">{p.count}</span>
          </li>
        ))}
      </ol>

      {auditCount > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          {auditCount} low-confidence hits pending review.
        </p>
      )}
      {forbiddenProjects > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Based on {accessibleProjects} accessible projects. {forbiddenProjects} projects could not be scanned due to credentials.
        </p>
      )}
    </section>
  );
}
