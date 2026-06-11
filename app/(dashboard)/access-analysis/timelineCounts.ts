/**
 * Pure aggregation for the Activity timeline. Each input row is a (project,
 * month) activity count. The client passes the full row set plus the shared
 * project-picker selection; this filters to the selected projects, sums per
 * calendar month, and emits a CONTINUOUS, zero-filled month axis from the
 * earliest to the latest month in scope (so quiet months show as dips to zero).
 * No React/DOM/IO.
 */
export interface ActivityTimelineRow {
  projectId: string; // "" = account-level (admin) activity
  projectName: string; // carried for callers (e.g. the loader); not read by summarizeActivityTimeline
  month: string; // "YYYY-MM" (UTC calendar month)
  count: number;
}

export interface TimelinePoint {
  month: string; // "YYYY-MM"
  label: string; // e.g. "Mar 2024"
  count: number;
}

export interface TimelineSummary {
  points: TimelinePoint[]; // continuous, zero-filled, ascending by month
  total: number;
  peak: TimelinePoint | null; // busiest month (ties -> earliest)
  busiestYear: { year: string; count: number } | null;
  span: { from: string; to: string } | null; // first/last month of the axis
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "YYYY-MM" -> absolute month index (year*12 + month0). Pure integer math, no Date. */
function monthIndex(m: string): number {
  const [y, mo] = m.split("-");
  return Number(y) * 12 + (Number(mo) - 1);
}

/** absolute month index -> "YYYY-MM". */
function indexToMonth(i: number): string {
  const y = Math.floor(i / 12);
  const mo = i % 12;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> "Mon YYYY". */
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
}

export function summarizeActivityTimeline(
  rows: ReadonlyArray<{ projectId: string; month: string; count: number }>,
  selected: ReadonlySet<string>,
): TimelineSummary {
  // 1. Filter to selected projects, sum per month.
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (!selected.has(r.projectId)) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.count);
  }
  if (byMonth.size === 0) {
    return { points: [], total: 0, peak: null, busiestYear: null, span: null };
  }

  // 2. Continuous axis bounds.
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of byMonth.keys()) {
    const i = monthIndex(m);
    if (i < lo) lo = i;
    if (i > hi) hi = i;
  }

  // 3. Zero-fill + aggregate in one ascending pass.
  const points: TimelinePoint[] = [];
  let total = 0;
  let peak: TimelinePoint | null = null;
  const yearTotals = new Map<string, number>();
  for (let i = lo; i <= hi; i++) {
    const month = indexToMonth(i);
    const count = byMonth.get(month) ?? 0;
    const point: TimelinePoint = { month, label: monthLabel(month), count };
    points.push(point);
    total += count;
    if (!peak || count > peak.count) peak = point; // strict > => ties keep the earliest
    const year = month.slice(0, 4);
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + count);
  }

  // 4. Busiest year.
  let busiestYear: { year: string; count: number } | null = null;
  for (const [year, count] of yearTotals) {
    // strict > => ties keep the earliest year (yearTotals is built chronologically)
    if (!busiestYear || count > busiestYear.count) busiestYear = { year, count };
  }

  return {
    points,
    total,
    peak,
    busiestYear,
    span: { from: points[0].month, to: points[points.length - 1].month },
  };
}
