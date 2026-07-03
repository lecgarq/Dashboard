"use client";
import { useMemo } from "react";
import type { DrillPerson } from "../roleCounts";

/**
 * Consistent section heading: a readable title with a one-line plain-English
 * subtitle and an optional inline badge (e.g. ActivityCoverageBadge for NA-01).
 *
 * Extracted verbatim from AccessAnalysisCharts.tsx (20.1-05 tab-IA split) so
 * every tab panel component can share the same heading treatment.
 */
export function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {badge}
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Section heading variant for filterable panels that also carry a "View N people →"
 * affordance (INT-02). The affordance opens the shared people sheet — clicking a
 * slice does NOT open it (locked CONTEXT decision).
 */
export function SectionHeaderWithPeople({
  title,
  subtitle,
  people,
  onViewPeople,
  testId,
  badge,
}: {
  title: string;
  subtitle: string;
  /** All people in the current filtered view (from in-memory summary). */
  people: DrillPerson[];
  /** Opens the people sheet with the supplied list. Called only by this button. */
  onViewPeople: (people: DrillPerson[]) => void;
  testId: string;
  /** Optional inline badge (e.g. ActivityCoverageBadge for activity-derived panels). */
  badge?: React.ReactNode;
}) {
  // Deduplicate by email so cross-role/company duplication doesn't inflate count.
  const uniquePeople = useMemo(() => {
    const seen = new Set<string>();
    return people.filter((p) => {
      if (seen.has(p.email)) return false;
      seen.add(p.email);
      return true;
    });
  }, [people]);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {badge}
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {uniquePeople.length > 0 && (
        <button
          type="button"
          data-testid={testId}
          onClick={() => onViewPeople(uniquePeople)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/20"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View {uniquePeople.length} {uniquePeople.length === 1 ? "person" : "people"}
        </button>
      )}
    </div>
  );
}
