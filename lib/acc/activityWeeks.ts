/**
 * activityWeeks.ts — week bucketing for the activity universe scrubber.
 *
 * Pure UTC week math shared by the payload builder (scripts/build-activity-
 * universe-payload.ts, which derives the weekId column from the source event
 * timestamps) and the client scrubber (label rendering). Weeks are Monday-
 * anchored and counted from the Monday on/before the corpus month floor, so a
 * weekId is stable for a given monthFloor and never negative for in-corpus rows.
 */

const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Sentinel weekId for a row whose source event timestamp could not be resolved
 * (no AccActivity / AccActivityAccds match). Disclosed in the scrubber caption
 * rather than silently folded into a real week.
 */
export const WEEK_UNKNOWN = 65_535;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "YYYY-MM" corpus month floor → the UTC Monday on/before that month's first
 * day, as "YYYY-MM-DD". Returns "" when the floor is unparseable (the caller
 * then falls back to month granularity rather than inventing a week origin).
 */
export function weekFloorFromMonthFloor(monthFloor: string): string {
  const [y, m] = monthFloor.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  const first = new Date(Date.UTC(y, m - 1, 1));
  // getUTCDay: 0=Sun … 6=Sat. Monday-anchored → Sunday walks back 6 days.
  const backDays = (first.getUTCDay() + 6) % 7;
  return new Date(first.getTime() - backDays * DAY_MS).toISOString().slice(0, 10);
}

/** Milliseconds of a "YYYY-MM-DD" UTC week floor. NaN when unparseable. */
export function weekFloorMs(weekFloor: string): number {
  return Date.parse(`${weekFloor}T00:00:00.000Z`);
}

/** Whole weeks between the floor and `ts`. Clamped at 0 (pre-floor rows). */
export function weekIdFor(weekFloorMillis: number, ts: Date | number): number {
  const t = typeof ts === "number" ? ts : ts.getTime();
  return Math.max(0, Math.floor((t - weekFloorMillis) / WEEK_MS));
}

/** weekId → "Dec 2, 2024" (the Monday that starts the week). */
export function weekLabel(weekFloor: string, weekId: number): string {
  const base = weekFloorMs(weekFloor);
  if (!Number.isFinite(base)) return weekFloor;
  const d = new Date(base + weekId * WEEK_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** weekId → "MMM YYYY" of the week's Monday — the scrubber's month tick text. */
export function weekMonthLabel(weekFloor: string, weekId: number): string {
  const base = weekFloorMs(weekFloor);
  if (!Number.isFinite(base)) return weekFloor;
  const d = new Date(base + weekId * WEEK_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
