// lib/forma/folderFilter.ts
// ACC projects carry hidden system/module "root" folders (Issues, Submittals,
// Correspondence, Quantification, the COST root, design-collab GUID roots…) that
// never appear in the Docs UI and whose `name` is a raw GUID or code. The Forma
// proposal should only show the real document tree (Project Files, Photos, …).
// Pure — no I/O — so the pruning rule is unit-tested.
import type { FormaFolder } from "./inheritance";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_TOKEN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Non-GUID system roots that embed no project id.
const SYSTEM_ROOTS = new Set(["submittals-attachments", "projecttb"]);

/** True when a ROOT folder's name is ACC system/module plumbing, not a real folder. */
export function isSystemRootName(name: string): boolean {
  const n = name.trim();
  if (GUID_RE.test(n)) return true; // bare GUID root
  if (UUID_TOKEN_RE.test(n)) return true; // "COST Root Folder def5…", "issue_def5…"
  if (/^\d+$/.test(n)) return true; // "0", "000"
  if (SYSTEM_ROOTS.has(n.toLowerCase())) return true;
  return false;
}

/**
 * Keep only folders belonging to a real (non-system) root subtree. A folder's
 * "realness" is inherited from its root: a system root and ALL its descendants
 * are dropped; real roots (Project Files, Photos) and their subtrees survive.
 */
export function selectRealFolders(folders: FormaFolder[]): FormaFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const memo = new Map<string, boolean>();

  function isReal(f: FormaFolder, seen: Set<string>): boolean {
    const cached = memo.get(f.id);
    if (cached !== undefined) return cached;
    if (seen.has(f.id)) return true; // cycle guard — don't drop on a loop
    seen.add(f.id);
    const parent = f.parentId ? byId.get(f.parentId) : undefined;
    const res = parent ? isReal(parent, seen) : !isSystemRootName(f.name);
    memo.set(f.id, res);
    return res;
  }

  return folders.filter((f) => isReal(f, new Set()));
}
