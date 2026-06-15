// lib/forma/hierarchy.ts
// Pure role-organogram structure: a custom reporting tree the user arranges.
// A role maps to a parent role (or null = top-level under a synthetic root).
// An org chart is a TREE, so re-parenting must reject cycles. No I/O — unit-tested.

export const HIERARCHY_ROOT = "__root__";

/** roleId → parentId (another roleId) or null (= top-level). */
export type HierarchyMap = Record<string, string | null>;

/**
 * Ensure every role has an entry; drop entries for unknown roles; coerce an
 * unknown/self parent to null; and break any cycles (a corrupt persisted map)
 * by detaching the node that closes the loop.
 */
export function normalizeHierarchy(map: HierarchyMap, roleIds: string[]): HierarchyMap {
  const ids = new Set(roleIds);
  const out: HierarchyMap = {};
  for (const id of roleIds) {
    const p = map[id];
    out[id] = p && p !== id && ids.has(p) ? p : null;
  }
  for (const id of roleIds) {
    const seen = new Set<string>([id]);
    let cur = out[id];
    while (cur !== null) {
      if (seen.has(cur)) {
        out[id] = null; // cycle → detach this node to the root
        break;
      }
      seen.add(cur);
      cur = out[cur] ?? null;
    }
  }
  return out;
}

/** True when `nodeId` sits within the subtree rooted at `ancestorId`. */
export function isDescendant(nodeId: string, ancestorId: string, map: HierarchyMap): boolean {
  let cur = map[nodeId] ?? null;
  const guard = new Set<string>();
  while (cur !== null && !guard.has(cur)) {
    if (cur === ancestorId) return true;
    guard.add(cur);
    cur = map[cur] ?? null;
  }
  return false;
}

/**
 * Can `roleId` be re-parented under `newParentId`?
 * - null (top-level) → always.
 * - itself → never.
 * - a descendant of itself → never (would create a cycle).
 */
export function canReparent(roleId: string, newParentId: string | null, map: HierarchyMap): boolean {
  if (newParentId === null) return true;
  if (newParentId === roleId) return false;
  return !isDescendant(newParentId, roleId, map);
}

/** Re-parent (returns a NEW map). Invalid moves return the same map unchanged. */
export function reparent(map: HierarchyMap, roleId: string, newParentId: string | null): HierarchyMap {
  if (!canReparent(roleId, newParentId, map)) return map;
  return { ...map, [roleId]: newParentId };
}

export interface OrgInput {
  id: string;
  parentId: string | null;
}

/** Flat (id, parentId) list for d3.stratify: one synthetic root + every role. */
export function toOrgInput(
  roleIds: string[],
  map: HierarchyMap,
  rootId: string = HIERARCHY_ROOT,
): OrgInput[] {
  const norm = normalizeHierarchy(map, roleIds);
  const nodes: OrgInput[] = [{ id: rootId, parentId: null }];
  for (const id of roleIds) nodes.push({ id, parentId: norm[id] ?? rootId });
  return nodes;
}

/** Explicit-folder count per role (coverage shown on each node). */
export function coverageByRole(
  assignments: Record<string, Record<string, unknown>>,
  roleIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of roleIds) out[id] = Object.keys(assignments[id] ?? {}).length;
  return out;
}
