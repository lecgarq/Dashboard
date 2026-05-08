/**
 * Active-user tier bucketing — maps a `lastSignIn` ISO string (or null/undefined) to
 * one of 7d / 30d / 90d / >90d / Never.
 *
 * Plan 04-03 / DASH-02. Used by ActiveUserTiersWidget (Nivo stacked bar) and KPI
 * strip in the dashboard.
 *
 * Pitfall 4: BulkAccUser.lastSignIn is `string | null | undefined`. Older cache rows
 * synced before Phase 2.5 are `undefined`; ACC reports "no activity" as `null`.
 * Both, plus malformed ISO strings, are bucketed as "Never" defensively.
 *
 * Boundaries are INCLUSIVE on the lower-day side: a sign-in exactly 7 days ago is
 * still "7d"; 30 days ago is still "30d"; 90 days ago is still "90d".
 */

import { differenceInDays, parseISO, isValid } from "date-fns";

export const ACTIVE_TIERS = ["7d", "30d", "90d", ">90d", "Never"] as const;
export type ActiveTier = (typeof ACTIVE_TIERS)[number];

export function bucketActiveUserTier(
  lastSignIn: string | null | undefined,
  now: Date,
): ActiveTier {
  if (lastSignIn == null) return "Never";

  let parsed: Date;
  try {
    parsed = parseISO(lastSignIn);
  } catch {
    return "Never";
  }
  if (!isValid(parsed)) return "Never";

  const days = differenceInDays(now, parsed);
  if (Number.isNaN(days)) return "Never";

  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  return ">90d";
}
