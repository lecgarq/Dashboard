// lib/forma/inheritance.ts
// Pure folder-tree permission resolution. A role's assignments are a sparse map
// of EXPLICIT overrides (folderId → tier, including an explicit "No access").
// A folder with no explicit entry inherits the nearest ancestor that has one.
import { NO_ACCESS, type FormaTier } from "./tiers";

export interface FormaFolder {
  id: string;
  parentId: string | null;
  name: string;
  fullPath: string | null;
}

/** roleId-scoped explicit overrides: folderId → tier. */
export type ExplicitMap = Record<string, FormaTier>;

export interface FolderIndex {
  byId: Map<string, FormaFolder>;
  childrenOf: Map<string | null, FormaFolder[]>;
  roots: FormaFolder[];
}

export function buildFolderIndex(folders: FormaFolder[]): FolderIndex {
  const byId = new Map<string, FormaFolder>();
  const childrenOf = new Map<string | null, FormaFolder[]>();
  for (const f of folders) {
    byId.set(f.id, f);
    const arr = childrenOf.get(f.parentId);
    if (arr) arr.push(f);
    else childrenOf.set(f.parentId, [f]);
  }
  // A folder is a root when it has no parent, or its parent is not in this set.
  const roots = folders.filter((f) => f.parentId === null || !byId.has(f.parentId));
  return { byId, childrenOf, roots };
}

export interface EffectiveTier {
  tier: FormaTier;
  inherited: boolean;
  sourceId: string | null; // folder the value came from, or null for the default
}

export function resolveEffectiveTier(
  folderId: string,
  explicit: ExplicitMap,
  byId: Map<string, FormaFolder>,
): EffectiveTier {
  if (Object.prototype.hasOwnProperty.call(explicit, folderId)) {
    return { tier: explicit[folderId], inherited: false, sourceId: folderId };
  }
  let cur = byId.get(folderId)?.parentId ?? null;
  const guard = new Set<string>(); // cycle safety
  while (cur !== null && !guard.has(cur)) {
    guard.add(cur);
    if (Object.prototype.hasOwnProperty.call(explicit, cur)) {
      return { tier: explicit[cur], inherited: true, sourceId: cur };
    }
    cur = byId.get(cur)?.parentId ?? null;
  }
  return { tier: NO_ACCESS, inherited: false, sourceId: null };
}

export function applyToSubtree(
  folderId: string,
  tier: FormaTier,
  explicit: ExplicitMap,
  index: FolderIndex,
): ExplicitMap {
  const next: ExplicitMap = { ...explicit };
  const stack = [folderId];
  const guard = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (guard.has(id)) continue;
    guard.add(id);
    next[id] = tier;
    for (const child of index.childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return next;
}

export function countExplicit(explicit: ExplicitMap): number {
  return Object.keys(explicit).length;
}
