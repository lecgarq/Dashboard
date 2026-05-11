/**
 * Pure helpers for folder cluster layout in AccUsersGraph.
 * Phase 5.1 — GRAPH-04 (conditional on Phase 4 GO).
 *
 * These helpers are pure functions with no React or DOM dependencies, usable
 * in both the graph renderer and tests. If Phase 4 is NO-GO, this module
 * remains as dead code retained for v2.x revisit.
 */

export interface FolderClusterPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Deterministically places folder nodes in an offset region (+800, +800 world space)
 * away from the main user-node cluster, using a spiral layout to avoid overlap.
 *
 * Same urn + same index + same total → always the same output (deterministic).
 * |x| + |y| > 600 from origin to avoid overlapping the user cluster.
 */
export function folderInitialPosition(
  urn: string,
  index: number,
  total: number,
): FolderClusterPosition {
  // Spiral layout with golden-angle spacing around a fixed offset origin
  const OFFSET_X = 900;
  const OFFSET_Y = 900;
  const SPACING = 80; // world-space units between layers

  if (total <= 0) {
    return { x: OFFSET_X, y: OFFSET_Y, z: 0 };
  }

  // Use the index for angle, and a hash of urn for a tiny deterministic jitter
  const urnHash = Array.from(urn).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);
  const jitter = ((urnHash % 20) - 10) / 10; // small [-1, 1] nudge

  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399 radians
  const angle = index * goldenAngle;
  const radius = SPACING * Math.sqrt(index + 1) + jitter * 5;

  return {
    x: OFFSET_X + Math.cos(angle) * radius,
    y: OFFSET_Y + Math.sin(angle) * radius,
    z: 0,
  };
}

/**
 * Maps a folder's APS permission actions array to an RGBA color for the
 * user→folder edge. Colors are thin (alpha ≈ 0.25) translucent baseline.
 *
 * 6 documented permission tiers from APS Data Connector documentation:
 *   View Only          → blue
 *   View+Download      → cyan
 *   Upload Only        → yellow
 *   View+Download+Upload → green
 *   View+Download+Upload+Edit → orange
 *   Full Controller    → red (most permissive)
 */
export function permissionTierEdgeColor(
  actions: string[],
): [r: number, g: number, b: number, a: number] {
  const set = new Set(actions.map((a) => a.toLowerCase()));

  const canView = set.has("view") || set.has("read");
  const canDownload = set.has("download");
  const canUpload = set.has("upload") || set.has("create");
  const canEdit = set.has("edit") || set.has("update") || set.has("modify");
  const canDelete = set.has("delete");

  const ALPHA = 0.28;

  if (canDelete) {
    // Full Controller (most permissive — includes delete)
    return [1.0, 0.18, 0.18, ALPHA];
  }
  if (canEdit && canUpload && canDownload && canView) {
    // View+Download+Upload+Edit
    return [1.0, 0.6, 0.1, ALPHA];
  }
  if (canUpload && canDownload && canView) {
    // View+Download+Upload
    return [0.2, 0.85, 0.35, ALPHA];
  }
  if (canUpload && !canDownload) {
    // Upload Only
    return [0.95, 0.9, 0.1, ALPHA];
  }
  if (canDownload && canView) {
    // View+Download
    return [0.15, 0.8, 0.95, ALPHA];
  }
  // View Only (fallback)
  return [0.3, 0.5, 1.0, ALPHA];
}
