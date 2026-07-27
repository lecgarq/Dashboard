/**
 * Pure transform for the "Permission volume by level" panel (PERM-01 reframe —
 * owner UAT item 3, verbatim: "which role has the most admin permissions out of
 * all"). Aggregates `PermissionLevelRow[]` (from
 * `lib/server/permissionLevelView.ts`) per role into top-N + "Other" stacked
 * bars, segmented by verbatim stored `permType`. No React/DOM/IO — safe on both
 * server and client.
 */
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";

/** Default top-N cutoff before roles fold into "Other (N roles)". Exported so the
 * chart component can pass it back explicitly when the owner collapses an
 * expanded view (UAT gap-closure item 2 — "expand the Others to see the
 * permission volume as well"). */
export const DEFAULT_TOP_N = 10;

/**
 * Strongest -> weakest stack/legend order for the 6 live stored `permType`
 * values (verbatim, research-verified — NOT the `PermTier` labels from
 * `lib/acc/permissionMapping.ts`). Any unrecognized permType encountered in
 * live data is appended after these, alphabetically — honest passthrough,
 * never dropped or remapped.
 */
export const PERMISSION_LEVEL_ORDER = [
  "Full Controller",
  "View+Download+Upload+Edit",
  "View+Download+Upload",
  "View+Download",
  "Upload Only",
  "View Only",
] as const;

/** One role's aggregated permission-level footprint (a stacked chart bar). */
interface PermissionLevelBar {
  roleId: string;
  roleName: string;
  total: number;
  byLevel: Record<string, number>;
  projectCount: number;
}

/** One project row within a role's drill-down. */
interface PermissionLevelProjectRow {
  projectId: string;
  projectName: string;
  folderCount: number;
}

export interface PermissionLevelSummary {
  /** Top-N roles by total folder-permission count desc, plus a trailing "Other (N roles)" bar. */
  bars: PermissionLevelBar[];
  /** Ordered union of levels present in the data: PERMISSION_LEVEL_ORDER members present,
   * followed by any unrecognized permType values, alphabetically. */
  levels: string[];
  /** Role name -> per-project folderCount rows sorted desc. Keys match `bars[].roleName`
   * for every bar except the trailing "Other" bucket (no drill entry required for Other). */
  projectsByRole: Map<string, PermissionLevelProjectRow[]>;
}

/** One level's distinct-role count (owner ask 2026-07-13: "how many roles do
 *  I have with those types of permissions"). */
export interface RolesPerLevel {
  level: string;
  /** Distinct roles holding this level on at least one folder. */
  roles: number;
}

/**
 * Counts DISTINCT roles per permission level, plus the total distinct roles in
 * the rows. A role holding several levels is counted under each of them, so
 * per-level counts intentionally sum to more than `totalRoles` — the chip
 * strip states this. Level order matches PERMISSION_LEVEL_ORDER (strongest →
 * weakest), unrecognized levels appended alphabetically — same convention as
 * `summarizePermissionLevel`.
 */
export function countRolesPerLevel(
  rows: ReadonlyArray<PermissionLevelRow>,
): { perLevel: RolesPerLevel[]; totalRoles: number } {
  const rolesByLevel = new Map<string, Set<string>>();
  const allRoles = new Set<string>();
  for (const r of rows) {
    allRoles.add(r.roleId);
    const set = rolesByLevel.get(r.permType) ?? new Set<string>();
    set.add(r.roleId);
    rolesByLevel.set(r.permType, set);
  }
  const known = PERMISSION_LEVEL_ORDER.filter((level) => rolesByLevel.has(level));
  const unknown = [...rolesByLevel.keys()]
    .filter((level) => !(PERMISSION_LEVEL_ORDER as readonly string[]).includes(level))
    .sort((a, b) => a.localeCompare(b));
  return {
    perLevel: [...known, ...unknown].map((level) => ({
      level,
      roles: rolesByLevel.get(level)?.size ?? 0,
    })),
    totalRoles: allRoles.size,
  };
}

/**
 * Aggregates permission-level rows (already project-filtered by the caller)
 * per role: total folder-permission count and a per-level breakdown. Sorted by
 * total desc (tiebreak roleName localeCompare); roles beyond `topN` collapse
 * into a single "Other (N roles)" bar (aggregated byLevel, no drill entry —
 * same convention as `summarizePermissionFootprint`). `levels` is the ordered
 * union of levels actually present in the data. `projectsByRole` is the
 * click-to-drill payload, sourced entirely from the summary rows.
 */
export function summarizePermissionLevel(
  rows: ReadonlyArray<PermissionLevelRow>,
  topN: number = DEFAULT_TOP_N,
): PermissionLevelSummary {
  const byRole = new Map<
    string,
    {
      roleId: string;
      roleName: string;
      total: number;
      byLevel: Map<string, number>;
      projects: Map<string, PermissionLevelProjectRow>;
    }
  >();
  const levelsPresent = new Set<string>();

  for (const r of rows) {
    levelsPresent.add(r.permType);
    const entry = byRole.get(r.roleId) ?? {
      roleId: r.roleId,
      roleName: r.roleName,
      total: 0,
      byLevel: new Map<string, number>(),
      projects: new Map<string, PermissionLevelProjectRow>(),
    };
    entry.total += r.folderCount;
    entry.byLevel.set(r.permType, (entry.byLevel.get(r.permType) ?? 0) + r.folderCount);
    const existingProject = entry.projects.get(r.projectId);
    if (existingProject) {
      existingProject.folderCount += r.folderCount;
    } else {
      entry.projects.set(r.projectId, {
        projectId: r.projectId,
        projectName: r.projectName,
        folderCount: r.folderCount,
      });
    }
    byRole.set(r.roleId, entry);
  }

  const roleBars = [...byRole.values()]
    .map((entry) => ({
      roleId: entry.roleId,
      roleName: entry.roleName,
      total: entry.total,
      byLevel: entry.byLevel,
      projectCount: entry.projects.size,
      _projects: entry.projects,
    }))
    .sort((a, b) => b.total - a.total || a.roleName.localeCompare(b.roleName));

  const limit = Math.max(0, topN);
  const kept = roleBars.slice(0, limit);
  const rest = roleBars.slice(limit);

  const byLevelRecord = (levelMap: Map<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [level, count] of levelMap) out[level] = count;
    return out;
  };

  const bars: PermissionLevelBar[] = kept.map((r) => ({
    roleId: r.roleId,
    roleName: r.roleName,
    total: r.total,
    byLevel: byLevelRecord(r.byLevel),
    projectCount: r.projectCount,
  }));

  if (rest.length > 0) {
    const noun = rest.length === 1 ? "role" : "roles";
    const otherByLevel = new Map<string, number>();
    for (const r of rest) {
      for (const [level, count] of r.byLevel) {
        otherByLevel.set(level, (otherByLevel.get(level) ?? 0) + count);
      }
    }
    bars.push({
      roleId: "",
      roleName: `Other (${rest.length} ${noun})`,
      total: rest.reduce((sum, r) => sum + r.total, 0),
      byLevel: byLevelRecord(otherByLevel),
      projectCount: new Set(rest.flatMap((r) => [...r._projects.keys()])).size,
    });
  }

  const projectsByRole = new Map<string, PermissionLevelProjectRow[]>();
  for (const r of kept) {
    projectsByRole.set(
      r.roleName,
      [...r._projects.values()].sort((a, b) => b.folderCount - a.folderCount || a.projectName.localeCompare(b.projectName)),
    );
  }

  const knownPresent = PERMISSION_LEVEL_ORDER.filter((level) => levelsPresent.has(level));
  const unknownPresent = [...levelsPresent]
    .filter((level) => !(PERMISSION_LEVEL_ORDER as readonly string[]).includes(level))
    .sort((a, b) => a.localeCompare(b));
  const levels = [...knownPresent, ...unknownPresent];

  return { bars, levels, projectsByRole };
}
