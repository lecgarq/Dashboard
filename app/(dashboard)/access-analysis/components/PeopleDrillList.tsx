"use client";
import type { DrillPerson } from "../roleCounts";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * The ranked "people behind a slice" panel shared by all four people-donuts
 * (Role distribution, Users by company, Activity by role, Activity by company).
 * Pure presentation: the donut owns open/close state and passes the already-sorted
 * people for the open slice. Each row is a proportion bar + name + count + share,
 * optionally clickable through to the profile drawer. Rendered immediately above
 * each donut's legend so the detail sits next to the donut, not after a long scroll.
 */
export function PeopleDrillList({
  title,
  color,
  people,
  total,
  unitNoun,
  onUserClick,
  onClose,
  testId,
}: {
  /** The slice label, e.g. "Hermosillo". */
  title: string;
  /** Slice color for the header dot + row bars. */
  color: string;
  /** Already sorted desc by count. */
  people: DrillPerson[];
  /** The slice value, used for each person's share. */
  total: number;
  /** "activities" | "members" — plural noun for the header total. */
  unitNoun: string;
  /** Open a person's profile (same drawer Model Coordination uses). */
  onUserClick?: (email: string) => void;
  onClose: () => void;
  /** Preserves each donut's existing drill-down test id (e.g. "activity-role-drilldown"). */
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"} · {total.toLocaleString()} {unitNoun}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close breakdown"
          className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
        {people.map((u) => {
          const barPct = total > 0 ? (u.count / total) * 100 : 0;
          const clickable = !!(u.email && onUserClick);
          return (
            <li key={u.email} className="break-inside-avoid">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onUserClick!(u.email)}
                title={clickable ? `View ${u.name}'s profile` : u.email}
                className={`group/u relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ${
                  clickable ? "cursor-pointer hover:bg-accent" : "cursor-default"
                }`}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${barPct}%`, background: color, opacity: 0.12 }} />
                <span
                  className={`relative flex-1 truncate ${
                    clickable ? "text-foreground/90 group-hover/u:text-primary group-hover/u:underline underline-offset-2" : "text-foreground/85"
                  }`}
                >
                  {u.name}
                </span>
                <span className="relative shrink-0 tabular-nums text-foreground">{u.count.toLocaleString()}</span>
                <span className="relative w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(u.count, total)}</span>
                {clickable && (
                  <span aria-hidden className="relative shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/u:opacity-100">›</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
