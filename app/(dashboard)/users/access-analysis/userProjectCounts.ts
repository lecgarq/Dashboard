/**
 * userProjectCounts.ts — Stamp each feature snapshot with how many projects its user
 * appears on. A node id is "userId::projectId"; the count is the number of nodes that
 * share the userId. Mutates the array in place (called once at snapshot-build time).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function stampUserProjectCounts(features: NodeFeatureSnapshot[]): void {
  const counts = new Map<string, number>();
  for (const f of features) {
    const uid = f.nodeId.split("::")[0];
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  for (const f of features) {
    f.projectCount = counts.get(f.nodeId.split("::")[0]) ?? 0;
  }
}
