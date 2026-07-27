// lib/acc/rosterFreshness.ts
//
// Age of a hand-maintained snapshot.
//
// The ACC Template MTY roster (lib/acc/template-mty-roster.ts) is not reachable
// through any ACC API — it is transcribed by hand from ACC's web UI. A static
// "Roster updated 2026-06-10" line wears the grammar of live telemetry: it looks
// the same on the day it was captured and a year later. This turns the capture
// date into an age that degrades visibly, so the page stops implying freshness
// it does not have.

/** Snapshot is still trustworthy without comment. */
export const ROSTER_AGING_DAYS = 30;
/** Snapshot is old enough that the page should say so plainly. */
export const ROSTER_STALE_DAYS = 90;

export type RosterTone = "fresh" | "aging" | "stale";

export interface RosterAge {
  /** ISO date the snapshot was captured (echoed back for display). */
  capturedAt: string;
  /** Whole days between capture and `now`. Negative capture dates clamp to 0. */
  days: number;
  tone: RosterTone;
  /** Human age, e.g. "today", "6 days old", "2 months old". */
  ageLabel: string;
}

const MS_PER_DAY = 86_400_000;

function ageLabelFor(days: number): string {
  if (days <= 0) return "captured today";
  if (days === 1) return "1 day old";
  if (days < 60) return `${days} days old`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month old" : `${months} months old`;
}

/**
 * Describe how old a hand-captured snapshot is.
 *
 * `capturedAt` is a plain ISO date (YYYY-MM-DD). An unparseable value yields
 * `days: 0` with tone "stale" — an unreadable capture date is not evidence of
 * freshness, so it must not render as if it were.
 */
export function describeRosterAge(capturedAt: string, now: number): RosterAge {
  const capturedMs = Date.parse(capturedAt);
  if (Number.isNaN(capturedMs)) {
    return { capturedAt, days: 0, tone: "stale", ageLabel: "capture date unknown" };
  }
  const days = Math.max(0, Math.floor((now - capturedMs) / MS_PER_DAY));
  const tone: RosterTone =
    days >= ROSTER_STALE_DAYS ? "stale" : days >= ROSTER_AGING_DAYS ? "aging" : "fresh";
  return { capturedAt, days, tone, ageLabel: ageLabelFor(days) };
}
