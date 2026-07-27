import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import {
  buildUsersRows,
  buildProjectRows,
  type GraphUserRow,
  type GraphProjectRow,
} from "./graphTables";
import { rawRowToSnapshot, type RawFeatureRow } from "./featureSnapshot";
import { stampUserProjectCounts } from "./userProjectCounts";

export interface GraphNodes {
  /** DISTINCT `${user_id}::${project_id}` sorted ascending — matches loadNodeIds. */
  nodeIds: string[];
  /** NodeFeatureSnapshot[] aligned 1:1 with nodeIds. */
  features: NodeFeatureSnapshot[];
}

const PERMISSION_TIERS = [null, "view", "download", "upload", "edit", "control"] as const;

function permissionTierFromStrength(strength: number | undefined): string | null {
  return Number.isInteger(strength) && strength! >= 1 && strength! <= 5
    ? PERMISSION_TIERS[strength!]
    : null;
}

/**
 * Build the raw feature row for one (user, project) representative, mirroring the
 * COALESCE/CASE logic of buildFeatureSnapshot's SELECT. The pure-JS graph path
 * derives perm_tier from the same per-membership maximum strength already loaded.
 */
function toRawFeatureRow(pr: GraphProjectRow, u: GraphUserRow | undefined): RawFeatureRow {
  const lastSignIn = u?.last_sign_in ?? null; // MAX(u.last_sign_in) — one value per user
  const lastSigninDays =
    lastSignIn === null ? null : Math.floor((Date.now() - lastSignIn) / 86_400_000);
  return {
    user_id: pr.user_id,
    project_id: pr.project_id,
    full_name: u?.name ?? pr.email ?? pr.user_id, // COALESCE(u.name, up.email, up.user_id)
    email: pr.email ?? u?.email ?? null, // COALESCE(up.email, u.email)
    project_name: pr.project_name ?? pr.project_id,
    role_display: pr.role_id ?? "(no role)",
    perm_tier: permissionTierFromStrength(pr.perm_strength),
    activity_count: u?.active_count ?? 0,
    last_signin_days: lastSigninDays,
    firm_name: u?.firm_name ?? "",
    account_status: u?.account_status ?? "",
    permission_coverage: u?.permission_coverage ?? "unknown",
    is_project_admin: pr.is_project_admin,
    module_ids: pr.module_ids,
    added_on: pr.added_on,
    last_sign_in_instance: pr.last_sign_in_instance,
    perm_strength: pr.perm_strength,
    folder_breadth: pr.folder_breadth,
    accessible_data_bytes: pr.accessible_data_bytes,
    full_controller: pr.full_controller,
    perm_mixed: pr.perm_mixed,
    activity_mix_json: pr.activity_mix_json,
    activity_actions_json: pr.activity_actions_json,
    activity_total: pr.activity_total,
    last_activity: pr.last_activity,
    project_status: pr.project_status,
  };
}

/**
 * Pure, no-DuckDB equivalent of (loadNodeIds + buildFeatureSnapshot): builds the
 * graph node set + aligned feature snapshots directly from the hydrated bulk
 * users, removing the ~1-2s browser SQL-engine boot from the graph load path.
 *
 * Parity with the DuckDB path:
 *   - nodeIds = DISTINCT `${user_id}::${project_id}` sorted ascending (loadNodeIds).
 *   - one node per (user, project); every per-(user,project)-constant column maps
 *     identically. `role_display` takes the first role deterministically (DuckDB's
 *     ANY_VALUE/last-write was arbitrary — this is stricter, not different in meaning).
 *   - the row→snapshot mapping is the SHARED rawRowToSnapshot — byte-identical.
 */
export function buildGraphNodesFromUsers(users: readonly BulkAccUser[]): GraphNodes {
  const usersRows = buildUsersRows(users);
  const projectRows = buildProjectRows(users);

  const userById = new Map<string, GraphUserRow>();
  for (const u of usersRows) userById.set(u.user_id, u);

  // One representative project row per (user, project) — first wins.
  const repByNode = new Map<string, GraphProjectRow>();
  for (const pr of projectRows) {
    const id = `${pr.user_id}::${pr.project_id}`;
    if (!repByNode.has(id)) repByNode.set(id, pr);
  }

  const nodeIds = [...repByNode.keys()].sort();

  const features = nodeIds.map((id) => {
    const pr = repByNode.get(id)!;
    return rawRowToSnapshot(toRawFeatureRow(pr, userById.get(pr.user_id)));
  });

  stampUserProjectCounts(features);

  return { nodeIds, features };
}
