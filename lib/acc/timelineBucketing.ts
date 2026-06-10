import type { TimeWindow, TimelineBin } from "./accessAnalysisTypes";

export function pickBinSize(window: TimeWindow): TimelineBin {
  if (window === "30d") return "day";
  if (window === "90d" || window === "1y") return "week";
  return "month";
}

export function bucketStart(d: Date, bin: TimelineBin): Date {
  const yr = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  if (bin === "day") return new Date(Date.UTC(yr, mo, dy));
  if (bin === "month") return new Date(Date.UTC(yr, mo, 1));
  const dayStart = new Date(Date.UTC(yr, mo, dy));
  const dow = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - dow * 24 * 60 * 60 * 1000);
}

export function generateBuckets(start: Date, end: Date, bin: TimelineBin): Date[] {
  const out: Date[] = [];
  let cur = bucketStart(start, bin);
  const last = bucketStart(end, bin);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    if (bin === "day") cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    else if (bin === "week") cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
    else {
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }
  return out;
}

export function windowToDateRange(window: TimeWindow, now: Date = new Date()): { start: Date; end: Date } {
  const end = now;
  if (window === "30d") return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end };
  if (window === "90d") return { start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), end };
  if (window === "1y") return { start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), end };
  return { start: new Date(0), end };
}

interface HeatmapHourBin {
  x: string;
  y: number;
}

export interface HeatmapRow {
  id: string;
  data: HeatmapHourBin[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + ":00");

export function computeActivityHeatmap(dates: Date[]): HeatmapRow[] {
  const grid: Record<string, Record<string, number>> = {};
  for (const day of DAYS) {
    grid[day] = {};
    for (const hr of HOURS) {
      grid[day][hr] = 0;
    }
  }

  for (const d of dates) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) continue;
    const dayName = DAYS[d.getUTCDay()];
    const hourStr = String(d.getUTCHours()).padStart(2, "0") + ":00";
    if (grid[dayName] && grid[dayName][hourStr] !== undefined) {
      grid[dayName][hourStr]++;
    }
  }

  return DAYS.map((day) => ({
    id: day,
    data: HOURS.map((hr) => ({
      x: hr,
      y: grid[day][hr],
    })),
  }));
}
