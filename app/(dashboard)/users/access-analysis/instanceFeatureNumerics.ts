import type { NodeFeatureSnapshot } from "./interactionTypes";

/**
 * Raw numeric features for the hybrid embedding vector (EMB-01/EMB-02).
 * Values are exported RAW — the python pipeline owns normalization, because
 * scale parameters (log1p + max-scale) depend on the whole-dataset distribution.
 * `null` means MISSING (unknown), never zero; python encodes missing explicitly.
 *
 * Hybrid-vector dimension rationale (EMB-01 — one line each):
 *
 * INCLUDED — categorical tokens (see instanceFeatureTokens.ts):
 *   role, company, perm tier          — core access-pattern identity.
 *   permstr:<n> one-hot               — kept alongside the numeric (tier label utility).
 *   activity + recency buckets        — coarse liveness identity.
 *   affiliation, status, admin        — governance identity.
 *   mod:<key> multi-hot               — product-module signature.
 *   cov:<known|partial|unknown>       — crawl coverage joins similarity (data truth).
 * INCLUDED — numerics (this module):
 *   folderBreadth                     — how many folders reachable; magnitude matters.
 *   accessibleDataBytes               — data reach; magnitude matters (log-scaled).
 *   activityTotal                     — activity volume beyond the coarse bucket.
 *   membershipAgeDays                 — tenure; null = unknown addedOn.
 *   permissionStrength (0..5)         — ordered: 5 must sit closer to 4 than to 0.
 *   riskScore (0..5)                  — aggregated risk-flag count, ordered.
 * EXCLUDED:
 *   project identity                  — standing D5 spec: cluster by pattern, not membership.
 *   signinBucket                      — redundant with the finer activityRecencyBucket token.
 *   membershipBucket                  — superseded by raw membershipAgeDays.
 *   moduleFlags                       — redundant with the mod:<key> multi-hot.
 *   riskFlags booleans                — aggregated in riskScore.
 *   activityMix / actionCounts        — deferred; activityTotal + recency carry the signal.
 */
export interface InstanceFeatureNumerics {
  folderBreadth: number | null;
  accessibleDataBytes: number | null;
  activityTotal: number | null;
  membershipAgeDays: number | null;
  permissionStrength: number | null;
  riskScore: number | null;
}

export function instanceFeatureNumerics(f: NodeFeatureSnapshot): InstanceFeatureNumerics {
  return {
    folderBreadth: f.permissionTypeSummary?.folderBreadth ?? null,
    accessibleDataBytes: f.accessibleDataBytes ?? null,
    activityTotal: f.activityTotal ?? null,
    membershipAgeDays: f.membershipAgeDays ?? null,
    permissionStrength: typeof f.permissionStrength === "number" ? f.permissionStrength : null,
    riskScore: f.riskScore ?? null,
  };
}
