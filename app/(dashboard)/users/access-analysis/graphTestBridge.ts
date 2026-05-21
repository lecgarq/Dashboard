"use client";

/**
 * graphTestBridge.ts — flag-gated test observation window for the spatial graph.
 *
 * cosmos.gl (2D) and three.js (3D) render every node into a SINGLE WebGL canvas;
 * there are no per-node DOM elements an e2e test can query. This module exposes
 * `window.__ACC_GRAPH_TEST__` so a Playwright test can:
 *   - read what actually rendered (node count, NaN-free positions, mask state),
 *   - locate a node on screen so it can drive the REAL mouse to it,
 *   - read the data behind the hovered/selected nodes.
 *
 * It is NOT a separate interaction path. The `simulateHover/simulateClick`
 * helpers invoke the exact same `handlersRef` closures cosmos.gl itself calls
 * (registered by GraphInteractions), so the fallback exercises production wiring.
 *
 * Hard gate: everything is a no-op unless NEXT_PUBLIC_ACC_GRAPH_TEST === "1".
 * The flag is only set for the e2e dev server, never in a production build.
 */

import type { PhysicsLayer } from "./physicsLayer";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { GraphEventHandlers, NodeFeatureSnapshot } from "./interactionTypes";
import type { DeriveResult } from "./sameUserEdges";

export function isGraphTestEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACC_GRAPH_TEST === "1";
}

// ---- Mutable singletons populated by the live components --------------------

interface ShellState {
  physics: PhysicsLayer | null;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  graphRef: { current: GraphCanvasHandle | null } | null;
  mode: "2d" | "3d";
  selection: ReadonlySet<number> | null;
  isolated: number | null;
}

interface InteractionState {
  hoveredIndex: number | null;
  tooltipAnchor: [number, number] | null;
  /** The exact production handler object cosmos.gl / the 3D raycaster call into. */
  handlers: GraphEventHandlers | null;
}

const shell: ShellState = {
  physics: null,
  features: [],
  graphRef: null,
  mode: "2d",
  selection: null,
  isolated: null,
};

const interaction: InteractionState = {
  hoveredIndex: null,
  tooltipAnchor: null,
  handlers: null,
};

export function setShellTestState(patch: Partial<ShellState>): void {
  if (!isGraphTestEnabled()) return;
  Object.assign(shell, patch);
}

export function setInteractionTestState(patch: Partial<InteractionState>): void {
  if (!isGraphTestEnabled()) return;
  Object.assign(interaction, patch);
}

interface EdgeState {
  derive: DeriveResult | null;
  nodeCount: number;
  brightCount: number;
}

const edgeState: EdgeState = { derive: null, nodeCount: 0, brightCount: 0 };

export function setEdgeTestState(patch: Partial<EdgeState>): void {
  if (!isGraphTestEnabled()) return;
  Object.assign(edgeState, patch);
}

// ---- Helpers ---------------------------------------------------------------

function nodeIndexOf(nodeId: string): number {
  const f = shell.features;
  for (let i = 0; i < f.length; i++) {
    if (f[i].nodeId === nodeId) return i;
  }
  return -1;
}

/** Canvas-local screen pixels for a node, via the live 2D handle. null if unavailable. */
function nodeScreenPosition(nodeId: string): { x: number; y: number } | null {
  const i = nodeIndexOf(nodeId);
  if (i < 0 || !shell.physics) return null;
  const root = shell.graphRef?.current;
  if (!root || root.mode !== "2d" || !root.handle) return null;
  const p = shell.physics.getPositions();
  const sp = root.handle.spaceToScreen([p[i * 3], p[i * 3 + 1]]);
  if (!Number.isFinite(sp[0]) || !Number.isFinite(sp[1])) return null;
  return { x: sp[0], y: sp[1] };
}

function featureView(f: NodeFeatureSnapshot) {
  return {
    nodeId: f.nodeId,
    firmName: f.firmName,
    accountStatus: f.accountStatus,
    permissionCoverage: f.permissionCoverage,
    project: f.project,
    role: f.role,
  };
}

// ---- Public window API -----------------------------------------------------

export interface GraphTestApi {
  isReady(): boolean;
  getFrozen(): boolean;
  getMode(): "2d" | "3d";
  getRenderedNodeCount(): number;
  getFeatureCount(): number;
  getPositionsStats(): {
    count: number;
    anyNaN: boolean;
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    maxAbs: number;
  };
  getNodeIndex(nodeId: string): number;
  getFirstNodeId(): string | null;
  getCentermostNodeId(): string | null;
  getNodeScreenPosition(nodeId: string): { x: number; y: number } | null;
  getSampleSearchPrefix(): string | null;
  getTooltipState(): {
    visible: boolean;
    index: number | null;
    anchor: [number, number] | null;
    feature: ReturnType<typeof featureView> | null;
  };
  getSelectedNodeIds(): string[];
  getIsolatedNodeId(): string | null;
  getDimmedNodeCount(): number;
  getHighlightedNodeCount(): number;
  getMaskVersion(): number;
  getEdgeStats(): {
    count: number;
    selfEdges: number;
    duplicates: number;
    danglingEndpoints: number;
    malformedNodeIds: number;
    distinctUsersWithEdges: number;
  };
  getBrightEdgeCount(): number;
  getEdgeSample(): { nodeId: string; userId: string; expectedBrightCount: number } | null;
  getRendererState(): { renderLinks: boolean; linkCount: number } | null;
  simulateHover(nodeId: string): boolean;
  simulateHoverEnd(): void;
  simulateClick(nodeId: string): boolean;
  simulateBackgroundClick(): void;
}

function buildApi(): GraphTestApi {
  return {
    isReady() {
      return !!shell.physics && shell.features.length > 0;
    },
    getFrozen() {
      return shell.physics?.frozen ?? false;
    },
    getMode() {
      return shell.mode;
    },
    getRenderedNodeCount() {
      return shell.physics ? shell.physics.getPositions().length / 3 : 0;
    },
    getFeatureCount() {
      return shell.features.length;
    },
    getPositionsStats() {
      const out = {
        count: 0,
        anyNaN: false,
        min: [Infinity, Infinity, Infinity] as [number, number, number],
        max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
        center: [0, 0, 0] as [number, number, number],
        maxAbs: 0,
      };
      if (!shell.physics) return out;
      const p = shell.physics.getPositions();
      const n = p.length / 3;
      out.count = n;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i];
        const y = p[i + 1];
        const z = p[i + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          out.anyNaN = true;
          continue;
        }
        if (x < out.min[0]) out.min[0] = x;
        if (y < out.min[1]) out.min[1] = y;
        if (z < out.min[2]) out.min[2] = z;
        if (x > out.max[0]) out.max[0] = x;
        if (y > out.max[1]) out.max[1] = y;
        if (z > out.max[2]) out.max[2] = z;
        out.maxAbs = Math.max(out.maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
        sx += x;
        sy += y;
        sz += z;
      }
      if (n > 0) out.center = [sx / n, sy / n, sz / n];
      return out;
    },
    getNodeIndex(nodeId) {
      return nodeIndexOf(nodeId);
    },
    getFirstNodeId() {
      return shell.features[0]?.nodeId ?? null;
    },
    getCentermostNodeId() {
      if (!shell.physics || shell.features.length === 0) return null;
      const p = shell.physics.getPositions();
      const n = p.length / 3;
      if (n === 0) return null;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < n; i++) {
        cx += p[i * 3];
        cy += p[i * 3 + 1];
      }
      cx /= n;
      cy /= n;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = p[i * 3] - cx;
        const dy = p[i * 3 + 1] - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best >= 0 ? shell.features[best]?.nodeId ?? null : null;
    },
    getNodeScreenPosition(nodeId) {
      return nodeScreenPosition(nodeId);
    },
    getSampleSearchPrefix() {
      for (const f of shell.features) {
        const n = f.nameLower?.trim();
        if (n && n.length >= 2) return n.slice(0, Math.min(3, n.length));
      }
      return null;
    },
    getTooltipState() {
      const i = interaction.hoveredIndex;
      const f = i != null ? shell.features[i] ?? null : null;
      return {
        visible: i != null && interaction.tooltipAnchor != null,
        index: i,
        anchor: interaction.tooltipAnchor,
        feature: f ? featureView(f) : null,
      };
    },
    getSelectedNodeIds() {
      if (!shell.selection) return [];
      const ids: string[] = [];
      for (const i of shell.selection) {
        const f = shell.features[i];
        if (f) ids.push(f.nodeId);
      }
      return ids;
    },
    getIsolatedNodeId() {
      if (shell.isolated == null) return null;
      return shell.features[shell.isolated]?.nodeId ?? null;
    },
    getDimmedNodeCount() {
      if (!shell.physics) return 0;
      const m = shell.physics.alphaMask;
      let c = 0;
      for (let i = 0; i < m.length; i++) if (m[i] < 0.99) c++;
      return c;
    },
    getHighlightedNodeCount() {
      if (!shell.physics) return 0;
      const m = shell.physics.alphaMask;
      let c = 0;
      for (let i = 0; i < m.length; i++) if (m[i] >= 0.99) c++;
      return c;
    },
    getMaskVersion() {
      return shell.physics?.maskVersion ?? -1;
    },
    getEdgeStats() {
      const d = edgeState.derive;
      if (!d) {
        return { count: 0, selfEdges: 0, duplicates: 0, danglingEndpoints: 0, malformedNodeIds: 0, distinctUsersWithEdges: 0 };
      }
      const n = edgeState.nodeCount;
      let selfEdges = 0;
      let danglingEndpoints = 0;
      const seenPairs = new Set<string>();
      let duplicates = 0;
      for (const e of d.edges) {
        if (e.sourceIndex === e.targetIndex) selfEdges++;
        if (e.sourceIndex < 0 || e.sourceIndex >= n || e.targetIndex < 0 || e.targetIndex >= n) {
          danglingEndpoints++;
        }
        const a = Math.min(e.sourceIndex, e.targetIndex);
        const b = Math.max(e.sourceIndex, e.targetIndex);
        const key = `${a}-${b}`;
        if (seenPairs.has(key)) duplicates++;
        else seenPairs.add(key);
      }
      return {
        count: d.edges.length,
        selfEdges,
        duplicates,
        danglingEndpoints,
        malformedNodeIds: d.malformedCount,
        distinctUsersWithEdges: d.distinctUsersWithEdges,
      };
    },
    getBrightEdgeCount() {
      return edgeState.brightCount;
    },
    getEdgeSample() {
      const d = edgeState.derive;
      if (!d || d.edges.length === 0) return null;
      const userId = d.edges[0].userId;
      let expectedBrightCount = 0;
      for (const e of d.edges) if (e.userId === userId) expectedBrightCount++;
      return { nodeId: d.edges[0].sourceNodeId, userId, expectedBrightCount };
    },
    getRendererState() {
      const root = shell.graphRef?.current;
      if (!root || root.mode !== "2d" || !root.handle) return null;
      return root.handle.getRenderState();
    },
    simulateHover(nodeId) {
      const i = nodeIndexOf(nodeId);
      if (i < 0 || !interaction.handlers) return false;
      const pos = nodeScreenPosition(nodeId);
      interaction.handlers.onPointHover(i, pos ? [pos.x, pos.y] : [0, 0]);
      return true;
    },
    simulateHoverEnd() {
      interaction.handlers?.onPointHoverEnd();
    },
    simulateClick(nodeId) {
      const i = nodeIndexOf(nodeId);
      if (i < 0 || !interaction.handlers) return false;
      interaction.handlers.onPointClick(i);
      return true;
    },
    simulateBackgroundClick() {
      interaction.handlers?.onPointClick(undefined);
    },
  };
}

let installed = false;

/** Install the window bridge once. No-op unless the test flag is set. */
export function installGraphTestBridge(): void {
  if (!isGraphTestEnabled() || typeof window === "undefined" || installed) return;
  installed = true;
  (window as unknown as { __ACC_GRAPH_TEST__: GraphTestApi }).__ACC_GRAPH_TEST__ =
    buildApi();
}
