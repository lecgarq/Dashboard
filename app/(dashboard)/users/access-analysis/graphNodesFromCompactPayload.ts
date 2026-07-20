import type {
  CompactGraphPayload,
  CompressedGraphSnapshot,
} from "@/lib/acc/graphSnapshotPayload";
import { rawRowToSnapshot, type RawFeatureRow } from "./featureSnapshot";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { stampUserProjectCounts } from "./userProjectCounts";

export interface CompactGraphNodes {
  nodeIds: string[];
  features: NodeFeatureSnapshot[];
}

const PERMISSION_TIERS = [null, "view", "download", "upload", "edit", "control"] as const;

function timestampMillis(value: string | null): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function permissionTierFromStrength(strength: number): string | null {
  return Number.isInteger(strength) && strength >= 1 && strength <= 5
    ? PERMISSION_TIERS[strength]
    : null;
}

export async function decodeCompressedGraphSnapshot(
  snapshot: CompressedGraphSnapshot,
): Promise<CompactGraphPayload> {
  const encoded = atob(snapshot.gzipBase64);
  const compressed = Uint8Array.from(encoded, (character) => character.charCodeAt(0));
  const decompressed = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(decompressed).text()) as CompactGraphPayload;
}

/** Rehydrate aligned feature snapshots from the graph-only normalized tuples. */
export function buildGraphNodesFromCompactPayload(
  payload: CompactGraphPayload,
): CompactGraphNodes {
  const nodeIds: string[] = [];
  const features = payload.projects.map((project) => {
    const [
      userIndex,
      projectId,
      projectName,
      projectStatus,
      isAdmin,
      role,
      modules,
      addedOn,
      instanceLastSignIn,
      permissionStrength,
      folderBreadth,
      accessibleDataBytes,
      fullController,
      permissionMixed,
      activityMix,
      actionCounts,
      activityTotal,
      lastActivity,
    ] = project;
    const [
      userId,
      userName,
      activeCount,
      userLastSignIn,
      firmName,
      accountStatus,
      permissionCoverage,
    ] = payload.users[userIndex];
    const nodeId = `${userId}::${projectId}`;
    nodeIds.push(nodeId);

    const lastSignInMillis = timestampMillis(userLastSignIn);
    const row: RawFeatureRow = {
      user_id: userId,
      project_id: projectId,
      full_name: userName || userId,
      email: userId,
      project_name: projectName,
      role_display: role,
      perm_tier: permissionTierFromStrength(permissionStrength),
      activity_count: activeCount,
      last_signin_days: lastSignInMillis === null
        ? null
        : Math.floor((Date.now() - lastSignInMillis) / 86_400_000),
      firm_name: firmName,
      account_status: accountStatus,
      permission_coverage: permissionCoverage,
      is_project_admin: isAdmin,
      module_ids: modules,
      added_on: timestampMillis(addedOn),
      last_sign_in_instance: timestampMillis(instanceLastSignIn),
      perm_strength: permissionStrength,
      folder_breadth: folderBreadth,
      accessible_data_bytes: accessibleDataBytes,
      full_controller: fullController,
      perm_mixed: permissionMixed,
      activity_mix_json: JSON.stringify(activityMix),
      activity_actions_json: JSON.stringify(actionCounts),
      activity_total: activityTotal,
      last_activity: timestampMillis(lastActivity),
      project_status: projectStatus,
    };
    return rawRowToSnapshot(row);
  });

  stampUserProjectCounts(features);
  return { nodeIds, features };
}
