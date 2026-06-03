import type { AccessInstance } from "./types";

export interface RoleSlice {
  name: string;
  value: number;
}

/**
 * Count role assignments across every (user, project) instance.
 * One increment per role per instance: an instance with N roles contributes to
 * N slices, and the same role name across instances accumulates. Sorted
 * descending by count. Mirrors the legacy `roleCount` semantics from the
 * removed aggregations.ts so "people per role" stays consistent.
 */
export function roleCounts(rows: AccessInstance[]): RoleSlice[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const role of row.roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
