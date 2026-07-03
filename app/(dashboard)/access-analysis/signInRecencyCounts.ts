import { differenceInDays, parseISO, isValid } from "date-fns";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";

/**
 * Locked recency bands (20-CONTEXT.md "Dormant users interaction") — order matters,
 * this is the exact bar order the chart renders. "Never signed in" is the explicit,
 * never-dropped null bucket (ENG-01 truth: a null lastSignIn always lands here).
 */
export const RECENCY_BANDS = ["<30d", "30–90d", "90–365d", ">365d", "Never signed in"] as const;
export type RecencyBand = (typeof RECENCY_BANDS)[number];

/**
 * Buckets a serialized `lastSignIn` into one of the 5 locked bands. Mirrors
 * `bucketActiveUserTier`'s defensive parsing (null/undefined/unparseable -> Never)
 * with NEW boundaries: <30d, 30-90d (inclusive both ends), 91-365d, >365d.
 * `nowMs` is an explicit param for deterministic tests.
 */
export function bucketSignInRecency(lastSignIn: string | null | undefined, nowMs: number): RecencyBand {
  if (lastSignIn == null) return "Never signed in";

  let parsed: Date;
  try {
    parsed = parseISO(lastSignIn);
  } catch {
    return "Never signed in";
  }
  if (!isValid(parsed)) return "Never signed in";

  const days = differenceInDays(nowMs, parsed);
  if (Number.isNaN(days)) return "Never signed in";

  if (days < 30) return "<30d";
  if (days <= 90) return "30–90d";
  if (days <= 365) return "90–365d";
  return ">365d";
}

export interface RecencyDrillPerson {
  name: string;
  company: string;
  lastSignIn: string | null;
}

export interface RecencySummary {
  /** All 5 bands, locked order, zeros kept. */
  bands: { band: RecencyBand; count: number }[];
  /** Drill rows per band, sorted most-dormant first (oldest lastSignIn at top). */
  usersByBand: Map<RecencyBand, RecencyDrillPerson[]>;
}

/**
 * Buckets + summarizes rows into the 5 locked bands. Every band is always present
 * (count 0 when empty) so the chart never silently omits a bar. Drill rows within
 * each dated band are sorted oldest-first (most dormant first); "Never signed in"
 * rows keep stable input order (they have no date to rank by).
 */
export function summarizeSignInRecency(rows: SignInRecencyRow[], nowMs: number): RecencySummary {
  const counts = new Map<RecencyBand, number>(RECENCY_BANDS.map((b) => [b, 0]));
  const usersByBand = new Map<RecencyBand, RecencyDrillPerson[]>(RECENCY_BANDS.map((b) => [b, []]));

  for (const row of rows) {
    const band = bucketSignInRecency(row.lastSignIn, nowMs);
    counts.set(band, (counts.get(band) ?? 0) + 1);
    usersByBand.get(band)!.push({ name: row.name, company: row.company, lastSignIn: row.lastSignIn });
  }

  // Sort each dated band's drill list oldest-first (most dormant at top).
  // "Never signed in" has no date to sort by — keep stable input order.
  for (const band of RECENCY_BANDS) {
    if (band === "Never signed in") continue;
    const list = usersByBand.get(band)!;
    list.sort((a, b) => {
      const ta = a.lastSignIn ? Date.parse(a.lastSignIn) : 0;
      const tb = b.lastSignIn ? Date.parse(b.lastSignIn) : 0;
      return ta - tb; // oldest (smallest timestamp) first
    });
  }

  return {
    bands: RECENCY_BANDS.map((band) => ({ band, count: counts.get(band) ?? 0 })),
    usersByBand,
  };
}
