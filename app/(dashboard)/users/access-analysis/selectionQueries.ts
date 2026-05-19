/**
 * selectionQueries.ts — Phase 4-02 Task 1
 *
 * DuckDB aggregations for the lasso → pie panel (ANLY-01 + ANLY-02).
 *
 * Uses `getDuckDbClient()` directly (NOT Mosaic) — one-shot SELECTs are simpler
 * than wiring a Mosaic client for a single consumer (RESEARCH alternative).
 *
 * Pitfall 2: `CAST(COUNT(*) AS INTEGER)` plus defensive `Number()` to avoid BigInt
 *            propagating into `DonutPanel` SVG arc math.
 * Pitfall 9: inline `IN (...)` — acceptable at 10k-node v1 target.
 *
 * Open Q#1: graph_folder_permissions may not yet be populated. If the tier query
 *           returns zero rows, return a graceful single-slice fallback so the
 *           pie panel never appears broken to the user.
 */

import { getDuckDbClient } from "./duckdbClient";
import { GRAPH_ANALYTICS_SOURCE_TABLES } from "./graphSql";
import type { DonutSlice } from "./DonutPanel";

// Stable palette — exported so SelectionPanel can keep slice colors consistent
// across redraws driven by drill-down filtering.
export const PALETTE: readonly string[] = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#64748b", // slate
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

function escapeIdList(ids: readonly string[]): string {
  return ids.map((id) => `'${id.replaceAll("'", "''")}'`).join(",");
}

// ---------------------------------------------------------------------------
// Role aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate the selected nodes by `role_id` (from `graph_user_projects`).
 *
 * Returns `[]` for an empty input (no query issued).
 *
 * `graph_user_projects` exposes a single `role_id` column (not an array list) per
 * (user, project) row in the current schema, so we GROUP BY it directly. If the
 * schema later exposes a `role_ids` Arrow list, swap in `UNNEST(role_ids)`.
 */
export async function aggregateSelectionByRole(
  selectedNodeIds: readonly string[],
): Promise<DonutSlice[]> {
  if (selectedNodeIds.length === 0) return [];

  const { connection } = await getDuckDbClient();
  const idList = escapeIdList(selectedNodeIds);
  const userProjectsView = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects;

  const sql = `
    SELECT
      COALESCE(role_id, '(no role)') AS label,
      CAST(COUNT(*) AS INTEGER)      AS value
    FROM ${userProjectsView}
    WHERE concat(user_id, '::', project_id) IN (${idList})
    GROUP BY 1
    ORDER BY value DESC
  `;

  const table = await connection.query(sql);
  const rows = table.toArray() as Array<{ label: string; value: number | bigint }>;

  return rows.map((r, i) => ({
    label: String(r.label ?? "(no role)"),
    value: Number(r.value),
    color: colorForIndex(i),
  }));
}

// ---------------------------------------------------------------------------
// Permission-tier aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate the selected nodes by permission tier via JOIN
 * `graph_user_projects` ↔ `graph_folder_permissions` on `(project_id, role_id)`.
 *
 * If the folder permissions table is empty (RESEARCH Open Q#1), fall back to a
 * single "(no tier data)" slice so the pie panel still renders something useful.
 */
export async function aggregateSelectionByTier(
  selectedNodeIds: readonly string[],
): Promise<DonutSlice[]> {
  if (selectedNodeIds.length === 0) return [];

  const { connection } = await getDuckDbClient();
  const idList = escapeIdList(selectedNodeIds);
  const userProjectsView = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects;
  const folderPermsView = GRAPH_ANALYTICS_SOURCE_TABLES.folderPermissions;

  const sql = `
    SELECT
      COALESCE(fp.perm_tier, '(no tier)') AS label,
      CAST(COUNT(*) AS INTEGER)           AS value
    FROM ${userProjectsView} up
    LEFT JOIN ${folderPermsView} fp
      ON fp.project_id = up.project_id AND fp.role_id = up.role_id
    WHERE concat(up.user_id, '::', up.project_id) IN (${idList})
    GROUP BY 1
    ORDER BY value DESC
  `;

  let rows: Array<{ label: string; value: number | bigint }> = [];
  try {
    const table = await connection.query(sql);
    rows = table.toArray() as typeof rows;
  } catch {
    // Schema gap — return graceful fallback.
    return [
      {
        label: "(no tier data)",
        value: selectedNodeIds.length,
        color: "#64748b",
      },
    ];
  }

  const allEmpty =
    rows.length === 0 ||
    rows.every((r) => String(r.label) === "(no tier)" || r.label === null);

  if (allEmpty) {
    return [
      {
        label: "(no tier data)",
        value: selectedNodeIds.length,
        color: "#64748b",
      },
    ];
  }

  return rows.map((r, i) => ({
    label: String(r.label ?? "(no tier)"),
    value: Number(r.value),
    color: colorForIndex(i),
  }));
}
