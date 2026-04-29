import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type {
  AccTopologyHiddenNode,
  AccTopologyLink,
  AccTopologyLinkKind,
  GraphControlSettings,
  PhysicsConfig,
} from "./accGraphOrganicLayout";

type FloatBuffer = Float32Array<ArrayBufferLike>;
type UintBuffer = Uint32Array<ArrayBufferLike>;

type WorkerGlobal = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

type WorkerRequest =
  | {
      type: "init";
      session: number;
      nodeIds: string[];
      positions: FloatBuffer;
      hiddenNodes: AccTopologyHiddenNode[];
      topologyLinks: AccTopologyLink[];
      visibleIndices: UintBuffer;
      clusterIds: Int32Array;       // one cluster index per nodeId (-1 = no cluster)
      controls: GraphControlSettings;
      physics: PhysicsConfig;
      paused: boolean;
    }
  | { type: "visibility"; session: number; visibleIndices: UintBuffer }
  | { type: "controls"; controls: GraphControlSettings }
  | { type: "physics"; physics: PhysicsConfig }
  | { type: "pause"; paused: boolean }
  | { type: "drag"; nodeIndex: number; x: number; y: number }
  | { type: "release"; nodeIndex: number }
  | { type: "stop" };

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  kind: "visible" | AccTopologyHiddenNode["kind"];
  hidden: boolean;
  visibleIndex: number;
  radius: number;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  source: string | LayoutNode;
  target: string | LayoutNode;
  kind: AccTopologyLinkKind;
}

interface ProjectedLink {
  source: number;
  target: number;
}

const TICK_MS = 16;
const POST_INTERVAL_MS = 16;     // 60fps — match GPU render rate for smooth motion
const SETTLE_VELOCITY = 0.00008;

const workerSelf = self as unknown as WorkerGlobal;

let session = 0;
let nodeIds: string[] = [];
let nodeIndexById = new Map<string, number>();
let positions: FloatBuffer = new Float32Array(0);
let hiddenNodes: AccTopologyHiddenNode[] = [];
let topologyLinks: AccTopologyLink[] = [];
let visibleIndices: UintBuffer = new Uint32Array(0);
let visibleMask = new Uint8Array(0);
let clusterIds: Int32Array = new Int32Array(0);
let controls: GraphControlSettings = { spacing: 54, clusterStrength: 62, stability: 78, motion: 34 };
let physicsConfig: PhysicsConfig = { repulsion: 1.0, linkSpring: 1.0, gravity: 0.25 };
let paused = false;
let simulation: Simulation<LayoutNode, LayoutLink> | null = null;
let activeNodes: LayoutNode[] = [];
let activeNodeById = new Map<string, LayoutNode>();
let hiddenPositions = new Map<string, { x: number; y: number }>();
let renderLinks: ProjectedLink[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let lastPostAt = 0;
let lastAverageVelocity = 0;
let draggedIndex = -1;
let initialized = false;

function clamp01(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}

function seededPoint(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Spread hub nodes across [0.08, 0.92] × [0.08, 0.92] — wide grid instead of tight ring
  const u = ((hash >>> 0) % 100000) / 100000;
  const v = ((hash >>> 8) % 100000) / 100000;
  return { x: 0.08 + u * 0.84, y: 0.08 + v * 0.84 };
}

// SEPARATION slider (controls.spacing, 0–100) is the single distance/repulsion lever.
// Drives charge magnitude, collide radius, and link distance simultaneously so the user
// gets a uniform "more / less personal space" knob.
function separation01(): number {
  return clamp01(controls.spacing);
}

// CLUSTER slider (controls.clusterStrength, 0–100):
//   0   = pure organic d3-force layout (no cluster pull)
//   100 = nodes pulled hard toward their role-cluster centroid (Cosmos clusters look)
function clusterStrength01(): number {
  return clamp01(controls.clusterStrength);
}

function linkDistance(kind: AccTopologyLinkKind): number {
  // Base scales 0.5×–2.0× with separation slider.
  const base = 0.10 * (0.5 + separation01() * 1.5);
  if (kind === "user") return base * 0.65;
  if (kind === "access") return base * 0.80;
  if (kind === "project") return base * 1.0;
  return base;
}

function linkStrength(kind: AccTopologyLinkKind): number {
  // Tighter springs when clustering is dialed up — links pull cluster members together.
  const base = 0.04 + clusterStrength01() * 0.10;
  if (kind === "user") return base * 1.4;
  if (kind === "project") return base * 1.1;
  if (kind === "access") return base * 0.7;
  return base;
}

function collideRadius(node: LayoutNode): number {
  // Personal-space bubble. Doubles from min→max of separation slider.
  const base = node.hidden ? 0.025 : 0.040;
  return base * (0.5 + separation01() * 1.5);
}

function chargeStrength(node: LayoutNode): number {
  // D3-equivalent repulsion. Separation slider = 0 → -0.015, = 1 → -0.085.
  // Hidden hub nodes repel half as hard so they don't blow visible nodes outward.
  const mag = -(0.015 + separation01() * 0.070);
  return node.hidden ? mag * 0.5 : mag;
}

/**
 * Custom d3 force: pulls each visible node toward the centroid of its role-cluster.
 * Behaves like Cosmos's per-cluster center force (https://cosmos.gl/?path=/story/examples-clusters--with-labels).
 * Strength is 0 when slider is 0 (pure organic) → 0.6 at slider 100 (tight clusters).
 */
function applyClusterForce(alpha: number): void {
  const k01 = clusterStrength01();
  if (k01 <= 0 || clusterIds.length === 0) return;

  const sums = new Map<number, { x: number; y: number; count: number }>();
  for (const node of activeNodes) {
    if (node.hidden) continue;
    const idx = node.visibleIndex;
    if (idx < 0 || idx >= clusterIds.length) continue;
    const cid = clusterIds[idx];
    if (cid < 0) continue;
    let s = sums.get(cid);
    if (!s) { s = { x: 0, y: 0, count: 0 }; sums.set(cid, s); }
    s.x += node.x ?? 0;
    s.y += node.y ?? 0;
    s.count++;
  }
  for (const s of sums.values()) {
    if (s.count > 0) { s.x /= s.count; s.y /= s.count; }
  }

  const k = k01 * 0.6 * alpha;  // alpha-scaled so force respects d3's cooling schedule
  for (const node of activeNodes) {
    if (node.hidden) continue;
    const idx = node.visibleIndex;
    if (idx < 0 || idx >= clusterIds.length) continue;
    const cid = clusterIds[idx];
    if (cid < 0) continue;
    const s = sums.get(cid);
    if (!s) continue;
    node.vx = (node.vx ?? 0) + (s.x - (node.x ?? 0)) * k;
    node.vy = (node.vy ?? 0) + (s.y - (node.y ?? 0)) * k;
  }
}

function rebuildVisibleMask(): void {
  visibleMask = new Uint8Array(nodeIds.length);
  for (let i = 0; i < visibleIndices.length; i++) {
    const index = visibleIndices[i];
    if (index < visibleMask.length) visibleMask[index] = 1;
  }
}

function rememberHiddenPositions(): void {
  for (const node of activeNodes) {
    if (!node.hidden || typeof node.x !== "number" || typeof node.y !== "number") continue;
    hiddenPositions.set(node.id, { x: node.x, y: node.y });
  }
}

function buildProjectedLinks(activeTopologyLinks: AccTopologyLink[]): ProjectedLink[] {
  const visibleSourcesByHub = new Map<string, number[]>();
  for (const link of activeTopologyLinks) {
    const index = nodeIndexById.get(link.source) ?? -1;
    if (index < 0 || !visibleMask[index]) continue;
    const entries = visibleSourcesByHub.get(link.target) ?? [];
    entries.push(index);
    visibleSourcesByHub.set(link.target, entries);
  }

  const projected: ProjectedLink[] = [];
  const seen = new Set<string>();
  for (const indices of visibleSourcesByHub.values()) {
    const ordered = [...new Set(indices)].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      const source = ordered[i - 1];
      const target = ordered[i];
      const key = `${source}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      projected.push({ source, target });
    }
  }
  return projected;
}

function postLinks(): void {
  const sources = new Int32Array(renderLinks.map((link) => link.source));
  const targets = new Int32Array(renderLinks.map((link) => link.target));
  workerSelf.postMessage(
    { type: "links", session, sources, targets },
    [sources.buffer as ArrayBuffer, targets.buffer as ArrayBuffer],
  );
}

function postTickSnapshot(force = false): void {
  const now = Date.now();
  if (!force && now - lastPostAt < POST_INTERVAL_MS) return;
  lastPostAt = now;

  const snapshot = new Float32Array(positions);
  workerSelf.postMessage(
    {
      type: "tick",
      session,
      positions: snapshot,
      averageVelocity: lastAverageVelocity,
      linkCount: renderLinks.length,
      diagnostics: {
        activeNodeCount: activeNodes.length,
        hiddenNodeCount: activeNodes.filter((node) => node.hidden).length,
      },
    },
    [snapshot.buffer as ArrayBuffer],
  );
}

function rebuildSimulation(alpha = 0.35): void {
  rememberHiddenPositions();
  simulation?.stop();

  rebuildVisibleMask();
  const visibleSet = new Set<string>();
  const nextActiveNodes: LayoutNode[] = [];

  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const index = visibleIndices[offset];
    if (index >= nodeIds.length) continue;
    const id = nodeIds[index];
    visibleSet.add(id);
    nextActiveNodes.push({
      id,
      kind: "visible",
      hidden: false,
      visibleIndex: index,
      radius: 0.01,
      x: positions[index * 2],
      y: positions[index * 2 + 1],
      vx: 0,
      vy: 0,
    });
  }

  const usedHiddenIds = new Set<string>();
  const activeTopologyLinks = topologyLinks.filter((link) => {
    if (!visibleSet.has(link.source)) return false;
    usedHiddenIds.add(link.target);
    return true;
  });

  for (const hidden of hiddenNodes) {
    if (!usedHiddenIds.has(hidden.id)) continue;
    const remembered = hiddenPositions.get(hidden.id);
    const seed = remembered ?? seededPoint(hidden.id);
    nextActiveNodes.push({
      id: hidden.id,
      kind: hidden.kind,
      hidden: true,
      visibleIndex: -1,
      radius: 0.015,
      x: seed.x,
      y: seed.y,
      vx: 0,
      vy: 0,
    });
  }

  activeNodes = nextActiveNodes;
  activeNodeById = new Map(activeNodes.map((node) => [node.id, node]));
  const activeLinks: LayoutLink[] = activeTopologyLinks.map((link) => ({
    source: link.source,
    target: link.target,
    kind: link.kind,
  }));
  renderLinks = buildProjectedLinks(activeTopologyLinks);
  postLinks();

  // Gentle constant pull toward 0.5,0.5 keeps the graph from drifting off-screen.
  // Stability and Gravity sliders removed — no user-facing knob for these.
  const centerStrength = 0.005;

  simulation = forceSimulation<LayoutNode, LayoutLink>(activeNodes)
    .stop()
    .alpha(Math.max(0.03, alpha))
    .alphaMin(0.002)
    .alphaDecay(0.022)
    .velocityDecay(0.36)
    .force("link", forceLink<LayoutNode, LayoutLink>(activeLinks)
      .id((node) => node.id)
      .distance((link) => linkDistance(link.kind))
      .strength((link) => linkStrength(link.kind)))
    .force("charge", forceManyBody<LayoutNode>().strength(chargeStrength))
    .force("collide", forceCollide<LayoutNode>().radius(collideRadius).strength(0.8).iterations(3))
    .force("x", forceX<LayoutNode>(0.5).strength((node) => node.hidden ? centerStrength * 0.3 : centerStrength))
    .force("y", forceY<LayoutNode>(0.5).strength((node) => node.hidden ? centerStrength * 0.3 : centerStrength))
    .force("cluster", applyClusterForce);
  // forceCenter omitted — forceX/Y alone gives gentle centering without the ring-collapse effect

  if (draggedIndex >= 0) {
    const draggedNode = activeNodeById.get(nodeIds[draggedIndex]);
    if (draggedNode) {
      draggedNode.fx = positions[draggedIndex * 2];
      draggedNode.fy = positions[draggedIndex * 2 + 1];
    }
  }

  postTickSnapshot(true);
  ensureTimer();
}

function ensureTimer(): void {
  if (timer || paused || !initialized) return;
  timer = setInterval(step, TICK_MS);
}

function stopTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function step(): void {
  if (paused || !simulation || activeNodes.length === 0) return;

  // Single tick per frame — d3-component example pace; smoother than batch ticking.
  simulation.tick(1);

  let totalVelocity = 0;
  let visibleCount = 0;
  for (const node of activeNodes) {
    if (node.hidden) continue;
    const index = node.visibleIndex;
    if (index < 0) continue;
    positions[index * 2] = typeof node.x === "number" ? node.x : positions[index * 2];
    positions[index * 2 + 1] = typeof node.y === "number" ? node.y : positions[index * 2 + 1];
    totalVelocity += Math.hypot(node.vx ?? 0, node.vy ?? 0);
    visibleCount++;
  }
  lastAverageVelocity = visibleCount ? totalVelocity / visibleCount : 0;

  const active = simulation.alpha() > simulation.alphaMin() || lastAverageVelocity > SETTLE_VELOCITY || draggedIndex >= 0;
  postTickSnapshot(!active);
  if (!active) {
    stopTimer();
  }
}

workerSelf.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "stop") {
    initialized = false;
    simulation?.stop();
    simulation = null;
    stopTimer();
    return;
  }

  if (message.type === "controls") {
    controls = message.controls;
    rebuildSimulation(0.30);
    return;
  }

  if (message.type === "physics") {
    physicsConfig = message.physics;
    rebuildSimulation(0.25);
    return;
  }

  if (message.type === "pause") {
    paused = message.paused;
    if (paused) stopTimer();
    else ensureTimer();
    return;
  }

  if (message.type === "drag") {
    // renderLinks is stable across drag — link topology does not change while a node
    // is being dragged, only its position. The renderer is responsible for re-uploading
    // the link buffer per interactive frame so Cosmos's link spatial structure references
    // the current node positions (see CosmosGraphRenderer.draw()).
    draggedIndex = message.nodeIndex;
    const node = activeNodeById.get(nodeIds[message.nodeIndex]);
    if (node) {
      node.fx = message.x;
      node.fy = message.y;
      node.x = message.x;
      node.y = message.y;
      // D3 force-directed component example: alphaTarget(0.3).restart() on drag-start
      // keeps the simulation hot while the user moves the node.
      simulation?.alphaTarget(0.3);
      if (simulation && simulation.alpha() < 0.3) simulation.alpha(0.3);
    }
    if (message.nodeIndex >= 0 && message.nodeIndex < nodeIds.length) {
      positions[message.nodeIndex * 2] = message.x;
      positions[message.nodeIndex * 2 + 1] = message.y;
    }
    postTickSnapshot(true);
    ensureTimer();
    return;
  }

  if (message.type === "release") {
    const node = activeNodeById.get(nodeIds[message.nodeIndex]);
    if (node) {
      node.fx = undefined;
      node.fy = undefined;
    }
    if (draggedIndex === message.nodeIndex) draggedIndex = -1;
    // D3 component example: alphaTarget(0) on release — simulation cools to settled state.
    simulation?.alphaTarget(0);
    ensureTimer();
    return;
  }

  if (message.type === "init") {
    session = message.session;
    nodeIds = message.nodeIds;
    nodeIndexById = new Map(nodeIds.map((id, index) => [id, index]));
    positions = message.positions;
    hiddenNodes = message.hiddenNodes;
    topologyLinks = message.topologyLinks;
    visibleIndices = message.visibleIndices;
    clusterIds = message.clusterIds;
    controls = message.controls;
    physicsConfig = message.physics;
    paused = message.paused;
    draggedIndex = -1;
    initialized = true;
    rebuildSimulation(0.36);
    return;
  }

  if (message.session !== session) return;

  if (message.type === "visibility") {
    visibleIndices = message.visibleIndices;
    rebuildSimulation(0.16);
  }
};
