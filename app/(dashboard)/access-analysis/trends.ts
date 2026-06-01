import type { Category } from "./types";

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function tally(labels: string[]): Category[] {
  const m = new Map<string, number>();
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
}

export const bucketByWeek = (isoTimestamps: string[]): Category[] =>
  tally(isoTimestamps.map((t) => isoWeek(new Date(t))));

export const bucketByMonth = (isoDates: string[]): Category[] =>
  tally(isoDates.filter(Boolean).map((d) => d.slice(0, 7)));
