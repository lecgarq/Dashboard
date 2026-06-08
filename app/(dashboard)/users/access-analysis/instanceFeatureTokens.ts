import type { NodeFeatureSnapshot } from "./interactionTypes";

/**
 * Per-instance feature tokens — the definition of "similar access" for the
 * embedding. Categorical one-hots + module multi-hot + bucketed signals.
 * Project identity is DELIBERATELY EXCLUDED (spec D5) so clusters form by
 * access PATTERN, not raw project membership. Color-by-project still reveals
 * project distribution from the snapshot separately.
 */
export function instanceFeatureTokens(f: NodeFeatureSnapshot): string[] {
  const out = new Set<string>();
  out.add(`role:${f.role || "(none)"}`);
  out.add(`company:${f.firmName || "(none)"}`);
  out.add(`perm:${f.permTier ?? "(none)"}`);
  if (typeof f.permissionStrength === "number") out.add(`permstr:${f.permissionStrength}`);
  out.add(`act:${f.activityBucket}`);
  out.add(`recency:${f.activityRecencyBucket ?? "none"}`);
  out.add(`aff:${f.affiliation ?? (f.isExternal ? "external" : "internal")}`);
  out.add(`status:${f.accountStatus || "(none)"}`);
  out.add(`admin:${f.isAdmin ? "1" : "0"}`);
  for (const m of f.moduleSignature ?? []) out.add(`mod:${m}`);
  return Array.from(out).sort();
}
