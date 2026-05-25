/**
 * interactionTypes.ts — Shared types for the Phase 4-01 interaction layer.
 *
 * PURE TYPES ONLY. No runtime code. These contracts are consumed by:
 *   - usePredicateEngine.ts — composes filter/search/lasso/isolate/drill into one mask
 *   - LassoOverlay.tsx — captures freehand polygon + matches against cosmos.gl
 *   - GraphInteractions.tsx — owns interaction state; wires events into physics.setMask
 *   - 04-02 chrome (Toolbar / SliderSidebar / SelectionPanel) — produces PredicateInputs fields
 *
 * REND-04 / PHYS-04 boundary: nothing here may import from physicsLayer, math, or data
 * concretely — only `PhysicsLayer` as a type. Filter/search/lasso must NEVER reach
 * sim.alpha or sim.restart() — the predicate engine only calls physics.setMask().
 */

import type { PhysicsLayer } from "./physicsLayer";

/**
 * Per-node feature snapshot — built once from DuckDB graph_user_projects at mount
 * and held in a ref for the lifetime of the page. Index aligns with cosmos node order.
 *
 * Strings used by the predicate engine are pre-lowercased (RESEARCH Pitfall 4 avoidance —
 * we don't lowercase on every keystroke). Buckets are precomputed (RESEARCH Open Q#2).
 */
export interface NodeFeatureSnapshot {
  /** Stable cosmos node id — "userId::projectId" per CosmosCanvasClient. */
  nodeId: string;
  /** Pre-lowercased full name for prefix-match search. */
  nameLower: string;
  /** Pre-lowercased email for prefix-match search. */
  emailLower: string;
  /** Project display name (shown verbatim in tooltip). */
  project: string;
  /** Joined role display string (shown in tooltip + drives `role` filter dim). */
  role: string;
  /** Permission tier (e.g. "view" / "edit"); null when folder_permissions has no row. */
  permTier: string | null;
  /** External user flag (email outside INTERNAL_DOMAINS). Equals `affiliation === "external"`. */
  isExternal: boolean;
  /**
   * Three-way affiliation by email domain — "internal" (hermosillo.com),
   * "external", or "unknown" (missing/malformed email). Optional for backward
   * compatibility; set by buildFeatureSnapshot. See internalDomains.ts.
   */
  affiliation?: "internal" | "external" | "unknown";
  /** Coarse activity bucket — None / Low / Med / High per Phase 4 RESEARCH Open Q#2. */
  activityBucket: "None" | "Low" | "Med" | "High";
  /** Coarse last-sign-in bucket — <7d / <30d / <90d / >90d. */
  signinBucket: "<7d" | "<30d" | "<90d" | ">90d";
  /** Raw activity count (used by tooltip — bucket drives filter). */
  activityCountRaw: number;
  /** Pre-formatted relative last sign-in string for the tooltip ("3d ago"). */
  lastSignInRel: string;
  /** "known" | "partial" | "unknown" — folder-permission crawl coverage for this node. */
  permissionCoverage: "known" | "partial" | "unknown";
  /** DC firm/company name, or "" if none. */
  firmName: string;
  /** "active" | "inactive" | "" — account status (NOT recent activity). */
  accountStatus: string;
  /**
   * Project-admin flag for this instance (graph_user_projects.is_project_admin).
   * Optional for backward compatibility; populated by buildFeatureSnapshot (P2 T2).
   * Drives the `isAdmin` governance/risk dimension.
   */
  isAdmin?: boolean;
  /**
   * Non-baseline product/module keys for this instance (e.g. ["build","cost"]),
   * sorted + deduped, baselines (insight/docs) excluded. Optional for backward
   * compatibility; set by buildFeatureSnapshot. Drives the `module` dimension.
   */
  moduleSignature?: string[];

  /** [P5-A] Per-known-module presence flags derived from moduleSignature. */
  moduleFlags?: Record<string, boolean>;

  /** [P5-A subset, finalized P5-D] Boolean risk primitives. */
  riskFlags?: {
    externalHighPerm: boolean;      // external AND permissionStrength >= 4 (edit/control)
    staleButActive: boolean;        // no recent sign-in BUT account active + has access
    externalProjectAdmin: boolean;  // external AND isAdmin
    broadFolderAccess: boolean;     // folderBreadth >= BROAD_FOLDER_THRESHOLD
    highActivityHighPerm: boolean;  // activityTotal high AND permissionStrength >= 4
  };
  /** [P5-D] Count of true riskFlags, 0..5 — a primitive, NOT a weighted score. */
  riskScore?: number;
}

/**
 * Event handler triplet for click + hover. cosmos.gl (2D) and three.js raycaster (3D)
 * both call into this contract via a `handlersRef` indirection (Pitfall 5 — never pass
 * fresh closures into cosmos.gl config; route through a ref).
 */
export interface GraphEventHandlers {
  /** Index === undefined means background click — caller treats as "clear isolate". */
  onPointClick: (index: number | undefined) => void;
  /** Hovered point. `screenPos` is in canvas-local pixels (NOT page coords). */
  onPointHover: (index: number, screenPos: [number, number]) => void;
  /** Pointer left a hovered node (or background). */
  onPointHoverEnd: () => void;
}

/**
 * Input bundle passed to `usePredicateEngine`. Every interaction (filter chips,
 * search, lasso, drill-down pie click, click-isolate) writes ONE of these fields;
 * the engine collapses them into a SINGLE physics.setMask call. RESEARCH Pattern 1.
 */
export interface PredicateInputs {
  /** Physics handle — only `setMask` is called. No simulation symbols touched. */
  physics: PhysicsLayer;
  /** Per-node snapshot in cosmos index order. Built once at mount. */
  features: ReadonlyArray<NodeFeatureSnapshot>;
  /** Active filter chips: dimId → allowed value-set. Empty set = "any". */
  activeFilters: Readonly<Record<string, ReadonlySet<string>>>;
  /** Search query — already lowercased, already debounced upstream (Pitfall 4). */
  searchQuery: string;
  /** Lasso selection (cosmos node indices). null = inactive. */
  lassoSelection: ReadonlySet<number> | null;
  /** Pie-slice drill-down INSIDE the lasso selection. null = no drill. */
  drillDown: Readonly<Record<string, string>> | null;
  /** Click-isolate target — wins over all other gates when not null. */
  isolatedNodeIndex: number | null;
}

/**
 * Local interaction state owned by GraphInteractions. Surfaced here so 04-02's
 * RightPanelStack + Toolbar can reference the same shape if they read it back.
 */
export interface GraphInteractionState {
  hoveredIndex: number | null;
  tooltipAnchor: [number, number] | null;
  isolatedNodeIndex: number | null;
  lassoActive: boolean;
}
