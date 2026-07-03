/**
 * Pure transform for the "Permission footprint by role" panel (PERM-01). Aggregates
 * the already-BigInt-converted `PermissionFootprintRow[]` (from
 * `lib/server/permissionFootprintView.ts`) per role into top-N + "Other" bars, plus
 * a per-role project drill payload. No React/DOM/IO — safe on both server and client.
 */
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";

const DEFAULT_TOP_N = 10;

/** Human-readable byte string, e.g. "42.3 GB". B/KB/MB/GB/TB boundaries, 1024-based. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** One role's aggregated permission footprint (a chart bar). */
export interface PermissionFootprintBar {
  roleId: string;
  roleName: string;
  folderCount: number;
  totalBytes: number;
  projectCount: number;
}

/** One project row within a role's drill-down. */
export interface PermissionFootprintProjectRow {
  projectId: string;
  projectName: string;
  folderCount: number;
  totalBytes: number;
}

export interface PermissionFootprintSummary {
  /** Top-N roles by totalBytes desc, plus a trailing "Other (N roles)" bar when truncated. */
  bars: PermissionFootprintBar[];
  /** Role name -> its per-project rows, sorted by totalBytes desc. Keys match `bars[].roleName`
   * for every bar except the trailing "Other" bucket (no drill entry required for Other). */
  projectsByRole: Map<string, PermissionFootprintProjectRow[]>;
}

/**
 * Aggregates permission-footprint rows (already project-filtered by the caller)
 * per role: folder count, total bytes, and distinct project count. Sorted by
 * totalBytes desc; roles beyond `topN` collapse into a single "Other (N roles)"
 * bar (aggregated bytes/folders, no drill entry). `projectsByRole` is the
 * click-to-drill payload, sourced entirely from the summary rows.
 */
export function summarizePermissionFootprint(
  rows: ReadonlyArray<PermissionFootprintRow>,
  topN: number = DEFAULT_TOP_N,
): PermissionFootprintSummary {
  // Group rows by role, accumulating folder/byte totals and per-project drill rows.
  const byRole = new Map<
    string,
    { roleId: string; roleName: string; folderCount: number; totalBytes: number; projects: Map<string, PermissionFootprintProjectRow> }
  >();

  for (const r of rows) {
    const entry = byRole.get(r.roleId) ?? { roleId: r.roleId, roleName: r.roleName, folderCount: 0, totalBytes: 0, projects: new Map() };
    entry.folderCount += r.folderCount;
    entry.totalBytes += r.totalBytes;
    const existingProject = entry.projects.get(r.projectId);
    if (existingProject) {
      existingProject.folderCount += r.folderCount;
      existingProject.totalBytes += r.totalBytes;
    } else {
      entry.projects.set(r.projectId, {
        projectId: r.projectId,
        projectName: r.projectName,
        folderCount: r.folderCount,
        totalBytes: r.totalBytes,
      });
    }
    byRole.set(r.roleId, entry);
  }

  const roleBars = [...byRole.values()]
    .map((entry) => ({
      roleId: entry.roleId,
      roleName: entry.roleName,
      folderCount: entry.folderCount,
      totalBytes: entry.totalBytes,
      projectCount: entry.projects.size,
      _projects: entry.projects,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes || a.roleName.localeCompare(b.roleName));

  const limit = Math.max(0, topN);
  const kept = roleBars.slice(0, limit);
  const rest = roleBars.slice(limit);

  const bars: PermissionFootprintBar[] = kept.map((r) => ({
    roleId: r.roleId,
    roleName: r.roleName,
    folderCount: r.folderCount,
    totalBytes: r.totalBytes,
    projectCount: r.projectCount,
  }));

  if (rest.length > 0) {
    const noun = rest.length === 1 ? "role" : "roles";
    bars.push({
      roleId: "",
      roleName: `Other (${rest.length} ${noun})`,
      folderCount: rest.reduce((sum, r) => sum + r.folderCount, 0),
      totalBytes: rest.reduce((sum, r) => sum + r.totalBytes, 0),
      projectCount: new Set(rest.flatMap((r) => [...r._projects.keys()])).size,
    });
  }

  const projectsByRole = new Map<string, PermissionFootprintProjectRow[]>();
  for (const r of kept) {
    projectsByRole.set(
      r.roleName,
      [...r._projects.values()].sort((a, b) => b.totalBytes - a.totalBytes || a.projectName.localeCompare(b.projectName)),
    );
  }

  return { bars, projectsByRole };
}
