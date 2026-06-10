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

type AccTopologyHubKind = "project" | "role" | "module" | "access" | "user" | "folder";
type AccTopologyLinkKind =
  | AccTopologyHubKind
  | "role-folder"
  | "folder-project"
  | "user-similarity"
  // (user, project) topology (2026-05-13): visible thin gray link connecting
  // every pair of instance nodes that share the same userId. Lets you eye-track
  // a single person across the projects they appear in.
  | "same-person";

interface AccTopologyVisibleNode {
  id: string;
  index: number;
}

interface AccTopologyHiddenNode {
  id: string;
  kind: AccTopologyHubKind;
  label: string;
}

interface AccTopologyLink {
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
 * "Chaotic blob" seed positions — for views where structured project clusters
 * are visually undesired.
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
interface BlobWeightOverrides {
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

function normalizePositions(positions: Float32Array): Float32Array {
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

