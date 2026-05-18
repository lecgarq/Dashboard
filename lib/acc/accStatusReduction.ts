/**
 * Pure status reduction helper (Phase 09 LIST-01).
 *
 * Canonical port of `server/routers/acc-members.ts` lines 94-96. Exists so that
 * client-side code can produce the aggregated status without waiting for the
 * `enrichedUsers` tRPC query (graceful degradation) AND so the reducer can be
 * unit-tested in isolation against the server logic.
 *
 * Rule (must match server EXACTLY):
 *   - any "active" wins → "active"
 *   - else any "pending" wins → "pending"
 *   - else → "deleted"
 *
 * Unknown values (anything that is not exactly "active" or "pending") are
 * ignored; if all values are unknown the result is "deleted".
 */

export type AggregatedStatus = "active" | "pending" | "deleted";

export function reduceMemberStatus(statuses: readonly string[]): AggregatedStatus {
  if (statuses.some((s) => s === "active")) return "active";
  if (statuses.some((s) => s === "pending")) return "pending";
  return "deleted";
}
