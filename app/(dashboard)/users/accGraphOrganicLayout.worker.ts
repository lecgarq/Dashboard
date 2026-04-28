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
      controls: GraphControlSettings;
      paused: boolean;
    }
  | { type: "visibility"; session: number; visibleIndices: UintBuffer }
  | { type: "controls"; controls: GraphControlSettings }
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
const POST_INTERVAL_MS = 33;
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
let controls: GraphControlSettings = { spacing: 54, clusterStrength: 62, stability: 78, motion: 34 };
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
  const angle = ((hash >>> 0) % 100000) / 100000 * Math.PI * 2;
  const radius = 0.06 + (((hash >>> 8) % 100000) / 100000) * 0.22;
  return {
    x: 0.5 + Math.cos(angle) * radius,
    y: 0.5 + Math.sin(angle) * radius,
  };
}

function linkDistance(kind: AccTopologyLinkKind): number {
  const spacing01 = clamp01(controls.spacing);
  const base = 0.035 + spacing01 * 0.14;
  if (kind === "user") return base * 0.62;
  if (kind === "access") return base * 0.72;
  if (kind === "project") return base * 0.9;
  return base;
}

function linkStrength(kind: AccTopologyLinkKind): number {
  const cluster01 = clamp01(controls.clusterStrength);
  const base = 0.035 + cluster01 * 0.22;
  if (kind === "user") return base * 1.4;
  if (kind === "project") return base * 1.15;
  if (kind === "access") return base * 0.72;
  return base;
}

function collideRadius(node: LayoutNode): number {
  const spacing01 = clamp01(controls.spacing);
  return node.hidden ? 0.012 + spacing01 * 0.014 : 0.008 + spacing01 * 0.018;
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

  const stability01 = clamp01(controls.stability);
  const motion01 = clamp01(controls.motion);
  const charge = -(0.0006 + clamp01(controls.spacing) * 0.0045);
  const centerStrength = 0.003 + stability01 * 0.012;

  simulation = forceSimulation<LayoutNode, LayoutLink>(activeNodes)
    .stop()
    .alpha(Math.max(0.03, alpha + motion01 * 0.16))
    .alphaMin(0.002)
    .alphaDecay(0.035 + stability01 * 0.085)
    .velocityDecay(0.34 + stability01 * 0.48)
    .force("link", forceLink<LayoutNode, LayoutLink>(activeLinks)
      .id((node) => node.id)
      .distance((link) => linkDistance(link.kind))
      .strength((link) => linkStrength(link.kind)))
    .force("charge", forceManyBody<LayoutNode>().strength((node) => node.hidden ? charge * 0.45 : charge))
    .force("collide", forceCollide<LayoutNode>().radius(collideRadius).strength(0.72).iterations(2))
    .force("x", forceX<LayoutNode>(0.5).strength((node) => node.hidden ? centerStrength * 0.28 : centerStrength))
    .force("y", forceY<LayoutNode>(0.5).strength((node) => node.hidden ? centerStrength * 0.28 : centerStrength))
    .force("center", forceCenter<LayoutNode>(0.5, 0.5));

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

  const motion01 = clamp01(controls.motion);
  const ticksPerFrame = 1 + Math.round(motion01 * 3);
  simulation.tick(ticksPerFrame);

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
    rebuildSimulation(0.18 + clamp01(controls.motion) * 0.3);
    return;
  }

  if (message.type === "pause") {
    paused = message.paused;
    if (paused) stopTimer();
    else ensureTimer();
    return;
  }

  if (message.type === "drag") {
    draggedIndex = message.nodeIndex;
    const node = activeNodeById.get(nodeIds[message.nodeIndex]);
    if (node) {
      node.fx = message.x;
      node.fy = message.y;
      node.x = message.x;
      node.y = message.y;
      simulation?.alphaTarget(0.03 + clamp01(controls.motion) * 0.08);
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
    simulation?.alphaTarget(0).alpha(Math.max(simulation.alpha(), 0.12 + clamp01(controls.motion) * 0.12));
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
    controls = message.controls;
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
