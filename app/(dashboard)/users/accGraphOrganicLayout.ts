"use client";

import {
  collapseFoldersToDepth,
  type FolderHubInputRow,
} from "@/lib/acc/folderHubCollapse";
import {
  topKNeighbors,
  type SimilarityDim,
  type SimilarityInput,
} from "@/lib/acc/userSimilarity";
import type { PermTierKey, SimilarityDimKey } from "./accGraphFilters";

export interface OrganicLayoutNode {
  id: string;
  /** Canonical user id shared across all (user, project) instances of the
   *  same person. Optional for back-compat with tests / older callers; when
   *  absent the same-person link pass falls back to `email`. */
  userId?: string;
  email: string;
  name: string;
  projectId?: string;
  projectName?: string;
  isAdmin: boolean;
  roles: string[];
  lastAddedBucket: string;
  modules: string[];
  // ── Extra optional dimensions used by computeBlobSeedPositions for
  //    feature-tension positioning. Older callers (Canvas2D, tests) can
  //    leave these undefined; the layout treats absent fields as empty.
  /** Company name as extracted from ACC HQ (e.g. "Acme Corp"). */
  companyName?: string | null;
  /** Company-specific role (e.g. "Senior Architect"). */
  companyRole?: string | null;
  /** ISO timestamp of the user's last sign-in. Bucketed for layout. */
  lastSignIn?: string | null;
  /** Per-project role names — finer-grained than the de-duplicated `roles`. */
  perProjectRoleNames?: string[];
  /** "active" | "pending" | "deleted" — user lifecycle bucket. */
  aggregatedStatus?: "active" | "pending" | "deleted";
  /** Executive flag (org-directory enrichment). */
  executive?: boolean;
  /** Folder-hub IDs this (user, project, role) combo can reach — see
   *  AccUsersGraph buildFolderAccessLookup. Optional; absent when the
   *  folder-permission matrix isn't available on this route. */
  accessibleFolderHubs?: string[];
  /** True when the user is an external collaborator (non-internal email
   *  domain). Used as a binary axis in the blob layout so internal and
   *  external populations form distinct centers of mass. */
  isExternal?: boolean;
}

/**
 * Bucket a last-sign-in timestamp into a coarse activity tier so two users
 * who haven't logged in for ~the same amount of time land near each other.
 * Returns one of: "never" | "today" | "week" | "month" | "quarter" | "stale".
 */
function activityBucket(lastSignIn: string | null | undefined): string {
  if (!lastSignIn) return "never";
  const ts = Date.parse(lastSignIn);
  if (!Number.isFinite(ts)) return "never";
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 1) return "today";
  if (days < 7) return "week";
  if (days < 30) return "month";
  if (days < 90) return "quarter";
  return "stale";
}

export interface LayoutWeights {
  role: number;
  access: number;
  lastAdded: number;
  project: number;
  modules: number;
  userName: number;
}

export interface PhysicsSettings {
  attraction: number;
  repulsion: number;
  damping: number;
  motion: number;
}

export interface GraphControlSettings {
  spacing: number;
  clusterStrength: number;
  stability: number;
  motion: number;
}

export type AccTopologyHubKind = "project" | "role" | "module" | "access" | "user" | "folder";
export type AccTopologyLinkKind =
  | AccTopologyHubKind
  | "role-folder"
  | "folder-project"
  | "user-similarity"
  // (user, project) topology (2026-05-13): visible thin gray link connecting
  // every pair of instance nodes that share the same userId. Lets you eye-track
  // a single person across the projects they appear in.
  | "same-person";

export interface AccTopologyVisibleNode {
  id: string;
  index: number;
}

export interface AccTopologyHiddenNode {
  id: string;
  kind: AccTopologyHubKind;
  label: string;
}

export interface AccTopologyLink {
  source: string;
  target: string;
  kind: AccTopologyLinkKind;
  /** Set only for role-folder links — 4-tier collapse of the source PermType. */
  permTier?: PermTierKey;
  /** Set only for user-similarity links — which dimension produced the edge. */
  dimension?: SimilarityDimKey;
  /** Set only for user-similarity links — shared-attribute count from computeSimilarityEdges. */
  weight?: number;
}

/**
 * 6-tier APS PermType → 4-tier UI bucket (view | upload | edit | control).
 * Exported so renderers / legends reuse the exact same collapse.
 * Unknown / unmapped strings default to "view" (least privilege rendering).
 */
const PERM_TIER_LUT: Record<string, PermTierKey> = {
  "View Only": "view",
  "View+Download": "view",
  "Upload Only": "upload",
  "View+Download+Upload": "upload",
  "View+Download+Upload+Edit": "edit",
  "Full Controller": "control",
};

export function collapsePermTierKey(permType: string): PermTierKey {
  return PERM_TIER_LUT[permType] ?? "view";
}

export interface AccTopologyGraph {
  visibleNodes: AccTopologyVisibleNode[];
  hiddenNodes: AccTopologyHiddenNode[];
  links: AccTopologyLink[];
}

export const DEFAULT_LAYOUT_WEIGHTS: LayoutWeights = {
  role: 72,
  access: 38,
  lastAdded: 45,
  project: 68,
  modules: 42,
  userName: 30,
};

export const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = {
  attraction: 45,
  repulsion: 50,
  damping: 20,
  motion: 45,
};

export const DEFAULT_GRAPH_CONTROLS: GraphControlSettings = {
  spacing: 54,
  clusterStrength: 62,
  stability: 78,
  motion: 34,
};

export interface PhysicsConfig {
  repulsion: number;  // 0–2: forceManyBody charge intensity
  linkSpring: number; // 0–2: forceLink strength
  gravity: number;    // 0–1: forceX/Y pull toward center
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  repulsion: 1.0,
  linkSpring: 1.0,
  gravity: 0.25,
};

export const SEMANTIC_VECTOR_SIZE = 48;

function hashU32(value: string, salt = ""): number {
  let hash = 2166136261;
  const input = `${salt}:${value}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash01(value: string, salt = ""): number {
  return (hashU32(value, salt) % 100000) / 100000;
}

function featureAnchor(value: string, salt: string): { x: number; y: number } {
  const angle = hash01(value, `${salt}:angle`) * Math.PI * 2;
  const radius = 0.24 + hash01(value, `${salt}:radius`) * 0.24;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function averageFeatureAnchor(values: readonly string[], salt: string): { x: number; y: number; weight: number } {
  if (!values.length) return { x: 0, y: 0, weight: 0 };
  let x = 0;
  let y = 0;
  for (const value of values) {
    const anchor = featureAnchor(value, salt);
    x += anchor.x;
    y += anchor.y;
  }
  return { x: x / values.length, y: y / values.length, weight: 1 };
}

function clampUnit(value: number): number {
  return Math.max(0.04, Math.min(0.96, value));
}

function weight01(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}

function neutralPackAnchor(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const t = (index + 0.5) / count;
  const radius = Math.sqrt(t) * 0.13;
  const angle = index * goldenAngle;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function normalizeHubValue(value: string): string {
  return value.trim().toLowerCase();
}

function hubId(kind: AccTopologyHubKind, value: string): string {
  return `hub:${kind}:${encodeURIComponent(normalizeHubValue(value))}`;
}

function addUniqueSortedValues(values: readonly string[], target: Set<string>): void {
  for (const value of values) {
    const normalized = normalizeHubValue(value);
    if (normalized) target.add(normalized);
  }
}

/**
 * Optional Phase 7 inputs for `buildAccTopologyGraph`. All fields default to
 * undefined/null so existing callers that only pass `nodes` continue to work.
 */
export interface AccTopologyExtensions {
  /** Raw folder-permission rows (e.g. from `accFoldersRouter.getMatrix`). */
  folderMatrix?: ReadonlyArray<FolderHubInputRow>;
  /** Pre-resolved similarity input (users + their attributes). */
  similarityInput?: SimilarityInput | null;
  /** Enabled similarity dimensions. Empty/undefined = no similarity edges emitted.
   *  Phase 07.1: kept for transition; `simStr` now controls per-dim weight directly. */
  similarityDims?: ReadonlySet<SimilarityDim>;
  /** Phase 07.1: per-dim strength multiplier (0..1). Missing keys treated as 0
   *  (dim disabled). When undefined OR all values are 0, no user-similarity
   *  links are emitted. */
  simStr?: ReadonlyMap<SimilarityDim, number>;
  /** Minimum number of contributing dimensions for a pair to count. Defaults to 0. */
  simMin?: number;
  /** Top-K most-similar neighbors retained per user. Defaults to 20. */
  topK?: number;
  /** Folder collapse depth. Defaults to 2 (per Phase 7 RESEARCH). */
  folderDepth?: number;
}

export function buildAccTopologyGraph(
  nodes: readonly OrganicLayoutNode[],
  extensions: AccTopologyExtensions = {},
): AccTopologyGraph {
  const visibleNodes = nodes.map((node, index) => ({ id: node.id, index }));
  const hiddenById = new Map<string, AccTopologyHiddenNode>();
  const linkKeys = new Set<string>();
  const links: AccTopologyLink[] = [];

  const addHub = (kind: AccTopologyHubKind, value: string, label = value): string | null => {
    const normalized = normalizeHubValue(value);
    if (!normalized) return null;
    const id = hubId(kind, normalized);
    if (!hiddenById.has(id)) {
      hiddenById.set(id, { id, kind, label: label.trim() || normalized });
    }
    return id;
  };

  const addLink = (
    source: string,
    target: string | null,
    kind: AccTopologyLinkKind,
    extras?: { permTier?: PermTierKey; dimension?: SimilarityDimKey; weight?: number },
  ): void => {
    if (!target) return;
    const key = `${source}->${target}:${kind}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    const link: AccTopologyLink = { source, target, kind };
    if (extras?.permTier !== undefined) link.permTier = extras.permTier;
    if (extras?.dimension !== undefined) link.dimension = extras.dimension;
    if (extras?.weight !== undefined) link.weight = extras.weight;
    links.push(link);
  };

  // (user, project) instance topology (2026-05-13):
  //   - Project hub: kept. THE dominant attractor — instances cluster by
  //     their project, which is the whole point of the new model.
  //   - Access hub (admin/member): DROPPED. A 2-bucket hub at 24k node
  //     scale pulls everything into 2 super-clumps and adds no signal.
  //   - User hub (one node per email): DROPPED. It acted as a clique
  //     magnet — every instance of a user linked to the same user-hub
  //     node, which collapsed instances back together and defeated the
  //     fan-out. Replaced by the same-person chain (low-weight, visible)
  //     below.
  //   - Role / Module hubs: kept as secondary structure. Instances with
  //     the same role in different projects gain a weak shared neighbor.
  for (const node of nodes) {
    addLink(node.id, addHub("project", node.projectId || node.projectName || "No project", node.projectName || node.projectId || "No project"), "project");

    const roles = new Set<string>();
    addUniqueSortedValues(node.roles ?? [], roles);
    for (const role of [...roles].sort((a, b) => a.localeCompare(b))) {
      addLink(node.id, addHub("role", role), "role");
    }

    const modules = new Set<string>();
    addUniqueSortedValues(node.modules ?? [], modules);
    for (const moduleName of [...modules].sort((a, b) => a.localeCompare(b))) {
      addLink(node.id, addHub("module", moduleName), "module");
    }
  }

  // ─── (user, project) topology: same-person links (2026-05-13) ───────────────
  // Group every node by its canonical userId (email lowercased) and emit a
  // visible link between each pair of instances belonging to the same person.
  // A user on N projects produces (N choose 2) links — for N=9 that's 36
  // links per user, which is comfortable at hub scale. Renderer paints these
  // very faint so the graph reads as "person across projects" without noise.
  const idsByUser = new Map<string, string[]>();
  for (const node of nodes) {
    const uid = node.userId ?? node.email;
    if (!uid) continue;
    const bucket = idsByUser.get(uid);
    if (bucket) bucket.push(node.id);
    else idsByUser.set(uid, [node.id]);
  }
  // Chain (not clique) — sort instance ids and link each to the next one in
  // sequence. For a user on N projects: N-1 same-person links instead of
  // (N choose 2). At N=20 that's 19 vs 190; the original clique formulation
  // produced ~230k links across the dataset and overwhelmed the simulation
  // (Luis 2026-05-13: "everything is wrong and weird"). A chain still gives
  // a connected component per user — same-person can be eye-traced by
  // following the gray thread.
  for (const ids of idsByUser.values()) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length - 1; i++) {
      addLink(sorted[i], sorted[i + 1], "same-person");
    }
  }

  // ─── Phase 7: folder hubs + role-folder permission edges ────────────────────
  if (extensions.folderMatrix && extensions.folderMatrix.length > 0) {
    const collapsed = collapseFoldersToDepth(
      extensions.folderMatrix,
      extensions.folderDepth ?? 2,
    );
    for (const folder of collapsed) {
      // Folder hubs use their deterministic id directly (already namespaced by
      // `collapseFoldersToDepth` to avoid cross-project collisions). We bypass
      // `addHub`'s normalization so the id matches the renderer's expectation
      // ("hub:folder:<encoded>").
      const folderHubId = `hub:folder:${encodeURIComponent(folder.id)}`;
      if (!hiddenById.has(folderHubId)) {
        hiddenById.set(folderHubId, {
          id: folderHubId,
          kind: "folder",
          label: folder.name || folder.fullPath || folder.id,
        });
      }
      const projectHubId = addHub("project", folder.projectId, folder.projectId);
      if (projectHubId) {
        addLink(folderHubId, projectHubId, "folder-project");
      }
      for (const perm of folder.permissions) {
        const roleHubId = addHub("role", perm.roleId);
        if (!roleHubId) continue;
        addLink(roleHubId, folderHubId, "role-folder", {
          permTier: collapsePermTierKey(perm.permType),
        });
      }
    }
  }

  // ─── Phase 07.1: user-similarity force links (top-K) ────────────────────────
  // Kept regardless of viewMode — viewMode is a render-time visibility filter,
  // not a data filter (Pattern 3 from RESEARCH).
  //
  // These links are emitted with a transparent stroke (rgba(0,0,0,0)) by
  // `colorForTopologyLink` in AccUsersGraph — they exert spring force on the
  // cosmos.gl layout but never render. Similarity is positional ONLY (see
  // memory feedback_similarity_positional_only).
  const simStr = extensions.simStr;
  const hasAnyStrength = simStr ? [...simStr.values()].some((v) => v > 0) : false;
  if (
    extensions.similarityInput &&
    extensions.similarityInput.users.length >= 2 &&
    simStr &&
    hasAnyStrength
  ) {
    const k = extensions.topK ?? 20;
    const simMin = extensions.simMin ?? 0;
    const neighbors = topKNeighbors(extensions.similarityInput, simStr, simMin, k);
    // topKNeighbors returns directed lists; canonicalize (a < b) before addLink
    // so reciprocal neighbors collapse to a single undirected edge per pair.
    for (const [userId, list] of neighbors) {
      for (const n of list) {
        const a = userId < n.neighborId ? userId : n.neighborId;
        const b = userId < n.neighborId ? n.neighborId : userId;
        addLink(a, b, "user-similarity", {
          dimension: n.dominantDim as SimilarityDimKey | undefined,
          weight: n.force,
        });
      }
    }
  }

  return {
    visibleNodes,
    hiddenNodes: [...hiddenById.values()].sort((a, b) => a.id.localeCompare(b.id)),
    links,
  };
}

/**
 * Compute a project-clustered static layout.
 *
 * 2026-05-13: rewritten from a generic golden-angle sunflower (treating all
 * nodes equally) into a two-tier layout for the (user, project) instance
 * topology. The static layout is the FINAL layout — the GPU force sim is
 * disabled in the renderer so positions stay put. At 24k nodes the Intel
 * iGPU could not converge a force simulation in reasonable time (~1fps);
 * static placement is instant and stays interactive at full zoom/pan.
 *
 * Layout:
 *   1. Collect unique projects (null projectId → "no-project" bucket).
 *   2. Assign each project a centroid on a golden-angle sunflower so
 *      projects are spread roughly uniformly around the unit square.
 *   3. Place each instance node at its project's centroid plus a
 *      deterministic per-node jitter — instances cluster tightly around
 *      the project centroid, with enough offset that overlapping users
 *      remain individually clickable.
 *
 * Pure / deterministic — same inputs → same Float32Array, byte-identical.
 */
export function computeTopologySeedPositions(
  nodes: readonly OrganicLayoutNode[],
  cachedPositions?: Float32Array | readonly number[] | null,
): Float32Array {
  const expectedLength = nodes.length * 2;
  if (cachedPositions && cachedPositions.length === expectedLength) {
    const positions = new Float32Array(expectedLength);
    for (let i = 0; i < expectedLength; i++) {
      const value = cachedPositions[i];
      if (typeof value !== "number" || !Number.isFinite(value)) return computeTopologySeedPositions(nodes);
      positions[i] = value;
    }
    return positions;
  }

  const positions = new Float32Array(expectedLength);
  if (nodes.length === 0) return positions;

  // Step 1: enumerate projects in stable order (first appearance wins).
  const NO_PROJECT = "::no-project::";
  const projectOrder: string[] = [];
  const projectIndex = new Map<string, number>();
  for (const node of nodes) {
    const key = node.projectId || NO_PROJECT;
    if (!projectIndex.has(key)) {
      projectIndex.set(key, projectOrder.length);
      projectOrder.push(key);
    }
  }

  // Step 2: assign each project a centroid on a golden-angle sunflower.
  // Output coords live in [0,1]² with a comfortable inset so jitter+labels
  // never spill off the canvas edge.
  const projectCount = projectOrder.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sunflowerRadius = 0.42; // max distance from (0.5, 0.5) center
  const centroids = new Float64Array(projectCount * 2);
  for (let p = 0; p < projectCount; p++) {
    const t = projectCount <= 1 ? 0 : (p + 0.5) / projectCount;
    const radius = Math.sqrt(t) * sunflowerRadius;
    const angle = p * goldenAngle;
    centroids[p * 2] = 0.5 + Math.cos(angle) * radius;
    centroids[p * 2 + 1] = 0.5 + Math.sin(angle) * radius;
  }

  // Step 3: place each instance at its project centroid + per-node jitter.
  // Jitter radius scales down with project size so dense projects don't
  // overrun their neighbors. featureAnchor returns a deterministic 2D
  // offset in [-~0.48, ~0.48]² which we shrink to a small local cloud.
  const projectMemberCounts = new Map<string, number>();
  for (const node of nodes) {
    const key = node.projectId || NO_PROJECT;
    projectMemberCounts.set(key, (projectMemberCounts.get(key) ?? 0) + 1);
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const key = node.projectId || NO_PROJECT;
    const pIdx = projectIndex.get(key)!;
    const cx = centroids[pIdx * 2];
    const cy = centroids[pIdx * 2 + 1];
    const members = projectMemberCounts.get(key) ?? 1;
    // Jitter radius: grows with sqrt(members) so a 100-member project
    // gets a ~10× larger local cloud than a 1-member project, but
    // clamped so even huge projects don't bleed into their neighbors.
    const jitterScale = Math.min(0.06, 0.012 + Math.sqrt(members) * 0.0035);
    const j = featureAnchor(node.id, "instance-jitter");
    positions[i * 2] = clampUnit(cx + j.x * jitterScale);
    positions[i * 2 + 1] = clampUnit(cy + j.y * jitterScale);
  }
  return positions;
}

/**
 * "Chaotic blob" seed positions — alternative to computeTopologySeedPositions
 * for views where structured project clusters are visually undesired.
 *
 * Strategy: place each project's loose centroid at a deterministic but random-
 * looking 2D point (no spiral, no grid), then jitter every node strongly so
 * neighboring projects bleed into one another. Net effect: an organic mass
 * with subtle density variation where projects happen to overlap, but no
 * visible discs/spirals/clusters of fixed shape.
 *
 * Deterministic and pure — same nodes → byte-identical positions, but the
 * arrangement looks "chaotic" because both centroid and jitter are derived
 * from hashes of the projectId and node id respectively.
 */
/**
 * Feature-based blob: each node's position is a weighted average of "anchor
 * points" derived from its attributes (roles, modules, admin status, project,
 * lastAdded, identity). Two users with the same roles + modules land near
 * each other because their anchors overlap. Users with nothing in common
 * scatter freely.
 *
 * This produces *tension*: the position is a function of *who* the user is,
 * not just an unstructured hash of an id. The visual result is a chaotic
 * blob whose density variations actually mean something — clumps are
 * statistical "tribes" of users sharing attributes, not arbitrary geometry.
 *
 * Deterministic: same nodes → byte-identical positions.
 */
// Axis order MUST match the W block below and the anchorBuffer layout in
// precomputeBlobAnchorBuffer / applyBlobAnchorBuffer. Keep in sync.
export const BLOB_AXIS_KEYS = [
  "role",
  "modules",
  "access",
  "project",
  "lastAdded",
  "company",
  "companyRole",
  "activity",
  "perProjectRoles",
  "status",
  "executive",
  "folders",
  "external",
  "identity",
] as const;
export type BlobAxisKey = (typeof BLOB_AXIS_KEYS)[number];
export const BLOB_AXIS_COUNT = BLOB_AXIS_KEYS.length;
export const BLOB_AXIS_STRIDE = BLOB_AXIS_COUNT * 2; // (x, y) per axis per node

/**
 * Precompute the per-node feature anchors for the blob layout. Returns a
 * Float32Array of length nodes.length * BLOB_AXIS_STRIDE laid out as:
 *
 *   [n0_axis0_x, n0_axis0_y, n0_axis1_x, n0_axis1_y, ..., n1_axis0_x, ...]
 *
 * All the hashing (featureAnchor / averageFeatureAnchor) runs ONCE here, so
 * slider scrubs can produce new positions via a flat O(n × axes) multiply-
 * accumulate pass with no string hashing in the hot path.
 */
export function precomputeBlobAnchorBuffer(nodes: readonly OrganicLayoutNode[]): Float32Array {
  const buf = new Float32Array(nodes.length * BLOB_AXIS_STRIDE);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const role = averageFeatureAnchor(node.roles, "role");
    const modules = averageFeatureAnchor(node.modules, "modules");
    const access = featureAnchor(node.isAdmin ? "admin" : "non-admin", "access");
    const project = featureAnchor(node.projectId || "no-project", "project");
    const lastAdded = featureAnchor(node.lastAddedBucket || "unknown", "lastAdded");
    const company = featureAnchor(node.companyName || "no-company", "company");
    const companyRole = featureAnchor(node.companyRole || "no-companyRole", "companyRole");
    const activity = featureAnchor(activityBucket(node.lastSignIn), "activity");
    const perProjectRoles = averageFeatureAnchor(node.perProjectRoleNames ?? [], "perProjectRoles");
    const status = featureAnchor(node.aggregatedStatus || "unknown", "status");
    const executive = featureAnchor(node.executive ? "exec" : "non-exec", "executive");
    const folders = averageFeatureAnchor(node.accessibleFolderHubs ?? [], "folders");
    const external = featureAnchor(node.isExternal ? "external" : "internal", "external");
    const identity = featureAnchor(node.userId || node.email, "identity");
    const o = i * BLOB_AXIS_STRIDE;
    buf[o + 0]  = role.x;        buf[o + 1]  = role.y;
    buf[o + 2]  = modules.x;     buf[o + 3]  = modules.y;
    buf[o + 4]  = access.x;      buf[o + 5]  = access.y;
    buf[o + 6]  = project.x;     buf[o + 7]  = project.y;
    buf[o + 8]  = lastAdded.x;   buf[o + 9]  = lastAdded.y;
    buf[o + 10] = company.x;     buf[o + 11] = company.y;
    buf[o + 12] = companyRole.x; buf[o + 13] = companyRole.y;
    buf[o + 14] = activity.x;    buf[o + 15] = activity.y;
    buf[o + 16] = perProjectRoles.x; buf[o + 17] = perProjectRoles.y;
    buf[o + 18] = status.x;      buf[o + 19] = status.y;
    buf[o + 20] = executive.x;   buf[o + 21] = executive.y;
    buf[o + 22] = folders.x;     buf[o + 23] = folders.y;
    buf[o + 24] = external.x;    buf[o + 25] = external.y;
    buf[o + 26] = identity.x;    buf[o + 27] = identity.y;
  }
  return buf;
}

/**
 * Apply a weight set to a precomputed anchor buffer and write the resulting
 * normalized positions into `out` (length must equal nodeCount * 2).
 *
 * Hot path for slider scrub: no allocations, no string hashing, just a tight
 * multiply-accumulate over `nodeCount × BLOB_AXIS_COUNT` pairs followed by an
 * in-place normalize-to-[0.05, 0.95] pass.
 */
export function applyBlobAnchorBuffer(
  anchors: Float32Array,
  weights: number[],
  out: Float32Array,
): void {
  const nodeCount = out.length / 2;
  if (weights.length !== BLOB_AXIS_COUNT) {
    throw new Error(`applyBlobAnchorBuffer: weights length ${weights.length} != BLOB_AXIS_COUNT ${BLOB_AXIS_COUNT}`);
  }
  // Sum of weights → divisor for the weighted average. Falls back to 1 to
  // keep positions sensible when every slider is at 0 (everything maps to
  // identity-axis noise → still a blob, just unweighted).
  let total = 0;
  for (let a = 0; a < BLOB_AXIS_COUNT; a++) total += weights[a];
  const inv = total > 0 ? 1 / total : 1;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nodeCount; i++) {
    const o = i * BLOB_AXIS_STRIDE;
    let x = 0, y = 0;
    for (let a = 0; a < BLOB_AXIS_COUNT; a++) {
      const w = weights[a];
      if (w === 0) continue;
      x += anchors[o + a * 2] * w;
      y += anchors[o + a * 2 + 1] * w;
    }
    x = 0.5 + x * inv;
    y = 0.5 + y * inv;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // In-place normalize to [0.05, 0.95] preserving aspect.
  const rangeX = (maxX - minX) || 1;
  const rangeY = (maxY - minY) || 1;
  const maxRange = Math.max(rangeX, rangeY);
  const offsetX = (maxRange - rangeX) / 2;
  const offsetY = (maxRange - rangeY) / 2;
  for (let i = 0; i < nodeCount; i++) {
    out[i * 2]     = 0.05 + ((out[i * 2] - minX + offsetX) / maxRange) * 0.9;
    out[i * 2 + 1] = 0.05 + ((out[i * 2 + 1] - minY + offsetY) / maxRange) * 0.9;
  }
}

export interface BlobWeightOverrides {
  role?: number;
  modules?: number;
  access?: number;
  project?: number;
  lastAdded?: number;
  company?: number;
  companyRole?: number;
  activity?: number;
  perProjectRoles?: number;
  status?: number;
  executive?: number;
  folders?: number;
  external?: number;
  identity?: number;
}

export function computeBlobSeedPositions(
  nodes: readonly OrganicLayoutNode[],
  overrides: BlobWeightOverrides = {},
): Float32Array {
  const positions = new Float32Array(nodes.length * 2);
  if (nodes.length === 0) return positions;

  // Weights per feature axis. Higher = stronger pull from that dimension =
  // more visible clustering when users share that attribute. Overrides let
  // the Physics & Clustering panel drive each axis from a slider; missing
  // keys fall back to the tuned default.
  const pick = (k: keyof BlobWeightOverrides, dflt: number): number => {
    const v = overrides[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt;
  };
  const W = {
    role: pick("role", 1.0),
    modules: pick("modules", 1.0),
    access: pick("access", 0.8),
    project: pick("project", 0.6),
    lastAdded: pick("lastAdded", 0.4),
    company: pick("company", 0.7),
    companyRole: pick("companyRole", 0.5),
    activity: pick("activity", 0.5),
    perProjectRoles: pick("perProjectRoles", 0.6),
    status: pick("status", 0.3),
    executive: pick("executive", 0.4),
    folders: pick("folders", 0.9),
    external: pick("external", 0.7),
    identity: pick("identity", 0.3),
  } as const;
  const TOTAL =
    (W.role + W.modules + W.access + W.project + W.lastAdded +
      W.company + W.companyRole + W.activity + W.perProjectRoles +
      W.status + W.executive + W.folders + W.external + W.identity) || 1;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    const role = averageFeatureAnchor(node.roles, "role");
    const modules = averageFeatureAnchor(node.modules, "modules");
    const access = featureAnchor(node.isAdmin ? "admin" : "non-admin", "access");
    const project = featureAnchor(node.projectId || "no-project", "project");
    const lastAdded = featureAnchor(node.lastAddedBucket || "unknown", "lastAdded");
    const company = featureAnchor(node.companyName || "no-company", "company");
    const companyRole = featureAnchor(node.companyRole || "no-companyRole", "companyRole");
    const activity = featureAnchor(activityBucket(node.lastSignIn), "activity");
    const perProjectRoles = averageFeatureAnchor(node.perProjectRoleNames ?? [], "perProjectRoles");
    const status = featureAnchor(node.aggregatedStatus || "unknown", "status");
    const executive = featureAnchor(node.executive ? "exec" : "non-exec", "executive");
    const folders = averageFeatureAnchor(node.accessibleFolderHubs ?? [], "folders");
    const external = featureAnchor(node.isExternal ? "external" : "internal", "external");
    const identity = featureAnchor(node.userId || node.email, "identity");

    const x =
      (role.x * W.role + modules.x * W.modules + access.x * W.access +
        project.x * W.project + lastAdded.x * W.lastAdded + company.x * W.company +
        companyRole.x * W.companyRole + activity.x * W.activity +
        perProjectRoles.x * W.perProjectRoles + status.x * W.status +
        executive.x * W.executive + folders.x * W.folders +
        external.x * W.external + identity.x * W.identity) / TOTAL;
    const y =
      (role.y * W.role + modules.y * W.modules + access.y * W.access +
        project.y * W.project + lastAdded.y * W.lastAdded + company.y * W.company +
        companyRole.y * W.companyRole + activity.y * W.activity +
        perProjectRoles.y * W.perProjectRoles + status.y * W.status +
        executive.y * W.executive + folders.y * W.folders +
        external.y * W.external + identity.y * W.identity) / TOTAL;

    positions[i * 2] = 0.5 + x;
    positions[i * 2 + 1] = 0.5 + y;
  }

  // Weighted-average anchors statistically cancel out, leaving most nodes
  // clumped near the center. Normalize to fill [0.05, 0.95] so the blob
  // uses the whole canvas while preserving relative distances (the tension
  // between users is unchanged — only the scale).
  return normalizePositions(positions);
}

export function normalizePositions(positions: Float32Array): Float32Array {
  if (!positions.length) return positions;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length / 2; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const maxRange = Math.max(rangeX, rangeY);
  const offsetX = (maxRange - rangeX) / 2;
  const offsetY = (maxRange - rangeY) / 2;

  for (let i = 0; i < positions.length / 2; i++) {
    positions[i * 2] = 0.05 + ((positions[i * 2] - minX + offsetX) / maxRange) * 0.9;
    positions[i * 2 + 1] = 0.05 + ((positions[i * 2 + 1] - minY + offsetY) / maxRange) * 0.9;
  }
  return positions;
}

export function computeCentroid(positions: Float32Array): { x: number; y: number } {
  if (positions.length < 2) return { x: 0.5, y: 0.5 };
  let x = 0;
  let y = 0;
  const count = positions.length / 2;
  for (let i = 0; i < count; i++) {
    x += positions[i * 2];
    y += positions[i * 2 + 1];
  }
  return { x: x / count, y: y / count };
}

export function computeSemanticSeedPositions(nodes: readonly OrganicLayoutNode[], weights: LayoutWeights): Float32Array {
  const positions = new Float32Array(nodes.length * 2);
  const wp = weight01(weights.project);
  const wr = weight01(weights.role);
  const wa = weight01(weights.access);
  const wl = weight01(weights.lastAdded);
  const wm = weight01(weights.modules);
  const wu = weight01(weights.userName);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    const project = featureAnchor(node.projectName || node.projectId || "no-project", "project");
    const roles = averageFeatureAnchor(node.roles, "role");
    const access = node.isAdmin ? { x: -0.45, y: -0.30 } : { x: 0.40, y: 0.26 };
    const lastAddedAnchor = node.lastAddedBucket ? featureAnchor(node.lastAddedBucket, "lastAdded") : { x: 0, y: 0 };
    const modulesAnchor = averageFeatureAnchor(node.modules ?? [], "module");
    const userNameAnchor = node.name ? featureAnchor(node.name.toLowerCase(), "userName") : { x: 0, y: 0 };
    const compact = neutralPackAnchor(i, nodes.length);
    const jitter = featureAnchor(node.id, "instance");

    let x = 0;
    let y = 0;
    let semanticWeight = 0;
    const addAnchor = (anchor: { x: number; y: number }, weight: number) => {
      if (weight <= 0) return;
      x += anchor.x * weight;
      y += anchor.y * weight;
      semanticWeight += weight;
    };

    addAnchor(project, wp);
    addAnchor(access, wa);
    if (roles.weight > 0) addAnchor(roles, wr);
    if (node.lastAddedBucket) addAnchor(lastAddedAnchor, wl);
    if (modulesAnchor.weight > 0) addAnchor(modulesAnchor, wm);
    if (node.name) addAnchor(userNameAnchor, wu);

    if (semanticWeight < 0.01) {
      positions[i * 2] = clampUnit(0.5 + compact.x + jitter.x * 0.012);
      positions[i * 2 + 1] = clampUnit(0.5 + compact.y + jitter.y * 0.012);
      continue;
    }

    const influence = Math.min(1, semanticWeight);
    const anchorX = (x / semanticWeight) * 0.86;
    const anchorY = (y / semanticWeight) * 0.86;
    positions[i * 2] = clampUnit(0.5 + compact.x * (1 - influence) + anchorX * influence + jitter.x * 0.014);
    positions[i * 2 + 1] = clampUnit(0.5 + compact.y * (1 - influence) + anchorY * influence + jitter.y * 0.014);
  }

  return positions;
}

function addHashedFeature(vector: Float32Array, offset: number, value: string, weight: number): void {
  if (!value || weight <= 0) return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  const hash = hashU32(normalized, "semantic-vector");
  const index = offset + (hash % SEMANTIC_VECTOR_SIZE);
  const sign = (hash & 0x80000000) === 0 ? 1 : -1;
  vector[index] += sign * weight;
}

function addTextFeatures(vector: Float32Array, offset: number, value: string | undefined, weight: number, salt: string): void {
  if (!value || weight <= 0) return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  addHashedFeature(vector, offset, `${salt}:full:${normalized}`, weight);
  for (const token of normalized.split(/[^a-z0-9]+/i)) {
    if (token.length >= 2) addHashedFeature(vector, offset, `${salt}:token:${token}`, weight * 0.55);
  }
}

export function computeSemanticVectors(
  nodes: readonly OrganicLayoutNode[],
  weights: LayoutWeights,
): { vectors: Float32Array; vectorSize: number } {
  const vectors = new Float32Array(nodes.length * SEMANTIC_VECTOR_SIZE);
  const normalizedWeights = {
    role: weight01(weights.role),
    access: weight01(weights.access),
    lastAdded: weight01(weights.lastAdded),
    project: weight01(weights.project),
    modules: weight01(weights.modules),
    userName: weight01(weights.userName),
  };
  const vectorInfluence = Math.min(
    1,
    normalizedWeights.role +
      normalizedWeights.access +
      normalizedWeights.lastAdded +
      normalizedWeights.project +
      normalizedWeights.modules +
      normalizedWeights.userName,
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const offset = i * SEMANTIC_VECTOR_SIZE;

    addTextFeatures(vectors, offset, node.name, normalizedWeights.userName, "name");
    addTextFeatures(vectors, offset, node.projectName || node.projectId, normalizedWeights.project, "project");
    for (const role of node.roles) {
      addTextFeatures(vectors, offset, role, normalizedWeights.role, "role");
    }
    addHashedFeature(vectors, offset, node.isAdmin ? "access:admin" : "access:member", normalizedWeights.access);
    addHashedFeature(vectors, offset, `last-added:${node.lastAddedBucket || "unknown"}`, normalizedWeights.lastAdded);
    for (const mod of node.modules ?? []) {
      addTextFeatures(vectors, offset, mod, normalizedWeights.modules, "module");
    }

    let magnitude = 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      const value = vectors[offset + j];
      magnitude += value * value;
    }
    const scale = magnitude > 0 ? 1 / Math.sqrt(magnitude) : 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      vectors[offset + j] *= scale * vectorInfluence;
    }
  }

  return { vectors, vectorSize: SEMANTIC_VECTOR_SIZE };
}
