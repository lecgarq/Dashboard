import type { PhysicsSettings } from "./accGraphOrganicLayout";

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
      anchors: FloatBuffer;
      vectors: FloatBuffer;
      vectorSize: number;
      visibleIndices: UintBuffer;
      settings: PhysicsSettings;
      paused: boolean;
    }
  | {
      type: "retarget";
      session: number;
      anchors: FloatBuffer;
      vectors: FloatBuffer;
      vectorSize: number;
      visibleIndices: UintBuffer;
    }
  | { type: "visibility"; session: number; visibleIndices: UintBuffer }
  | { type: "settings"; settings: PhysicsSettings }
  | { type: "pause"; paused: boolean }
  | { type: "drag"; nodeIndex: number; x: number; y: number }
  | { type: "release"; nodeIndex: number }
  | { type: "stop" };

interface SimilarityLink {
  source: number;
  target: number;
  weight: number;
}

const TICK_MS = 16;
const POST_EVERY_TICKS = 2;
const NEIGHBOR_COUNT = 5;

let session = 0;
let nodeIds: string[] = [];
let positions: FloatBuffer = new Float32Array(0);
let velocities: FloatBuffer = new Float32Array(0);
let anchors: FloatBuffer = new Float32Array(0);
let vectors: FloatBuffer = new Float32Array(0);
let vectorSize = 0;
let visibleIndices: UintBuffer = new Uint32Array(0);
let visibleMask = new Uint8Array(0);
let links: SimilarityLink[] = [];
let settings: PhysicsSettings = { attraction: 58, repulsion: 64, damping: 72, motion: 58 };
let paused = false;
let timer: ReturnType<typeof setInterval> | null = null;
let tickCounter = 0;
let draggedIndex = -1;
let draggedX = 0;
let draggedY = 0;

const workerSelf = self as unknown as WorkerGlobal;

function clamp01(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}

function rebuildVisibleMask(): void {
  visibleMask = new Uint8Array(nodeIds.length);
  for (let i = 0; i < visibleIndices.length; i++) {
    const index = visibleIndices[i];
    if (index < visibleMask.length) visibleMask[index] = 1;
  }
}

function similarity(a: number, b: number): number {
  const ao = a * vectorSize;
  const bo = b * vectorSize;
  let dot = 0;
  for (let i = 0; i < vectorSize; i++) {
    dot += vectors[ao + i] * vectors[bo + i];
  }
  return dot;
}

function insertTopNeighbor(
  topIndices: Int32Array,
  topScores: Float32Array,
  candidate: number,
  score: number,
): void {
  if (score <= topScores[topScores.length - 1]) return;
  let slot = topScores.length - 1;
  while (slot > 0 && score > topScores[slot - 1]) {
    topScores[slot] = topScores[slot - 1];
    topIndices[slot] = topIndices[slot - 1];
    slot--;
  }
  topScores[slot] = score;
  topIndices[slot] = candidate;
}

function rebuildLinks(): void {
  links = [];
  const count = visibleIndices.length;
  if (!count || !vectorSize || vectors.length !== nodeIds.length * vectorSize) return;

  const seen = new Set<string>();
  for (let aOffset = 0; aOffset < count; aOffset++) {
    const a = visibleIndices[aOffset];
    const topIndices = new Int32Array(NEIGHBOR_COUNT);
    const topScores = new Float32Array(NEIGHBOR_COUNT);
    topIndices.fill(-1);
    topScores.fill(-Infinity);

    for (let bOffset = 0; bOffset < count; bOffset++) {
      if (aOffset === bOffset) continue;
      const b = visibleIndices[bOffset];
      const score = similarity(a, b);
      insertTopNeighbor(topIndices, topScores, b, score);
    }

    for (let i = 0; i < NEIGHBOR_COUNT; i++) {
      const b = topIndices[i];
      if (b < 0) continue;
      const source = Math.min(a, b);
      const target = Math.max(a, b);
      const key = `${source}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source, target, weight: 0.12 + Math.max(0, topScores[i]) * 0.88 });
    }
  }

  const linkSources = new Int32Array(links.map(l => l.source));
  const linkTargets = new Int32Array(links.map(l => l.target));
  workerSelf.postMessage(
    { type: "links", session, sources: linkSources, targets: linkTargets },
    [linkSources.buffer as ArrayBuffer, linkTargets.buffer as ArrayBuffer],
  );
}

function wakeSimulation(amount: number): void {
  if (!velocities.length) return;
  const clampedAmount = Math.max(0.001, Math.min(0.06, amount));
  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const index = visibleIndices[offset];
    const angle = ((index * 9301 + session * 49297) % 233280) / 233280 * Math.PI * 2;
    velocities[index * 2] += Math.cos(angle) * clampedAmount;
    velocities[index * 2 + 1] += Math.sin(angle) * clampedAmount;
  }
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(step, TICK_MS);
}

function stopTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function buildSpatialGrid(cellSize: number): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const index = visibleIndices[offset];
    const x = positions[index * 2];
    const y = positions[index * 2 + 1];
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    const cell = grid.get(key);
    if (cell) cell.push(index);
    else grid.set(key, [index]);
  }
  return grid;
}

function step(): void {
  if (paused || positions.length === 0 || visibleIndices.length === 0) return;

  const nodeCount = nodeIds.length;
  const fx = new Float32Array(nodeCount);
  const fy = new Float32Array(nodeCount);
  // attraction=0 → free-floating nodes; attraction=100 → pinned to anchors
  const anchorPull = 0.001 + clamp01(settings.attraction) * 0.10;
  // repulsion slider drives collision radius — geometric, predictable separation
  // repulsion=0: nodes nearly touch (r≈0.005); repulsion=100: nodes pushed far apart (r≈0.20)
  const collisionRadius = 0.005 + clamp01(settings.repulsion) * 0.195;
  // inverse-square background repulsion to prevent long-range collapse
  const repulsion = 0.000002 + clamp01(settings.repulsion) * 0.000150;
  // damping=0 → perpetual motion; damping=100 → instant settle
  const damping = 0.95 - clamp01(settings.damping) * 0.70;
  // motion=0 → near-frozen; motion=100 → fast/energetic
  const maxVelocity = 0.001 + clamp01(settings.motion) * 0.12;
  // spring rest length: short at high attraction (tight clusters), long at low attraction (loose)
  const attraction = 0.0003 + clamp01(settings.attraction) * 0.08;
  const restLength = 0.015 + (1 - clamp01(settings.attraction)) * 0.28;
  const cellSize = Math.max(collisionRadius * 2.5, 0.035);

  const grid = buildSpatialGrid(cellSize);
  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const i = visibleIndices[offset];
    const ix = positions[i * 2];
    const iy = positions[i * 2 + 1];
    const gx = Math.floor(ix / cellSize);
    const gy = Math.floor(iy / cellSize);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cell = grid.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;

        for (const j of cell) {
          if (j <= i) continue;
          let dx = positions[j * 2] - ix;
          let dy = positions[j * 2 + 1] - iy;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 0.000001) {
            dx = ((i % 7) - 3) * 0.001 || 0.001;
            dy = ((j % 11) - 5) * 0.001 || -0.001;
            dist2 = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(dist2);
          const repel = repulsion / Math.max(0.00001, dist2);
          const collision = dist < collisionRadius ? (collisionRadius - dist) * 0.15 : 0;
          const force = repel + collision;
          const nx = dx / dist;
          const ny = dy / dist;

          fx[i] -= nx * force;
          fy[i] -= ny * force;
          fx[j] += nx * force;
          fy[j] += ny * force;
        }
      }
    }
  }

  for (const link of links) {
    if (!visibleMask[link.source] || !visibleMask[link.target]) continue;
    const sx = positions[link.source * 2];
    const sy = positions[link.source * 2 + 1];
    const tx = positions[link.target * 2];
    const ty = positions[link.target * 2 + 1];
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const force = (dist - restLength) * attraction * link.weight;
    const nx = dx / dist;
    const ny = dy / dist;

    fx[link.source] += nx * force;
    fy[link.source] += ny * force;
    fx[link.target] -= nx * force;
    fy[link.target] -= ny * force;
  }

  // Ambient drift — keeps the graph organically alive at rest
  const t = tickCounter * 0.0008;
  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const i = visibleIndices[offset];
    const phase = (i * 7.391) % (Math.PI * 2);
    fx[i] += Math.sin(t * 0.9 + phase) * 0.00015;
    fy[i] += Math.cos(t * 0.65 + phase * 1.4) * 0.00015;
  }

  let totalVelocity = 0;
  for (let offset = 0; offset < visibleIndices.length; offset++) {
    const i = visibleIndices[offset];
    if (i === draggedIndex) continue;
    fx[i] += (anchors[i * 2] - positions[i * 2]) * anchorPull;
    fy[i] += (anchors[i * 2 + 1] - positions[i * 2 + 1]) * anchorPull;

    let vx = (velocities[i * 2] + fx[i]) * damping;
    let vy = (velocities[i * 2 + 1] + fy[i]) * damping;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxVelocity) {
      const scale = maxVelocity / speed;
      vx *= scale;
      vy *= scale;
    }

    velocities[i * 2] = vx;
    velocities[i * 2 + 1] = vy;
    positions[i * 2] = Math.max(-0.35, Math.min(1.35, positions[i * 2] + vx));
    positions[i * 2 + 1] = Math.max(-0.35, Math.min(1.35, positions[i * 2 + 1] + vy));
    totalVelocity += Math.sqrt(vx * vx + vy * vy);
  }

  // Pin dragged node to pointer position
  if (draggedIndex >= 0 && draggedIndex < nodeIds.length) {
    positions[draggedIndex * 2] = draggedX;
    positions[draggedIndex * 2 + 1] = draggedY;
    velocities[draggedIndex * 2] = 0;
    velocities[draggedIndex * 2 + 1] = 0;
  }

  tickCounter++;
  if (tickCounter % POST_EVERY_TICKS !== 0) return;

  const snapshot = new Float32Array(positions);
  workerSelf.postMessage(
    {
      type: "tick",
      session,
      positions: snapshot,
      averageVelocity: visibleIndices.length ? totalVelocity / visibleIndices.length : 0,
      linkCount: links.length,
    },
    [snapshot.buffer as ArrayBuffer],
  );
}

workerSelf.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "stop") {
    stopTimer();
    return;
  }

  if (message.type === "settings") {
    settings = message.settings;
    wakeSimulation(0.02 + clamp01(settings.motion) * 0.04);
    return;
  }

  if (message.type === "pause") {
    paused = message.paused;
    return;
  }

  if (message.type === "init") {
    session = message.session;
    nodeIds = message.nodeIds;
    positions = message.positions;
    anchors = message.anchors;
    vectors = message.vectors;
    vectorSize = message.vectorSize;
    visibleIndices = message.visibleIndices;
    settings = message.settings;
    paused = message.paused;
    velocities = new Float32Array(positions.length);
    tickCounter = 0;
    rebuildVisibleMask();
    rebuildLinks();
    ensureTimer();
    return;
  }

  if (message.type === "drag") {
    draggedIndex = message.nodeIndex;
    draggedX = message.x;
    draggedY = message.y;
    return;
  }

  if (message.type === "release") {
    if (draggedIndex === message.nodeIndex) {
      draggedIndex = -1;
      wakeSimulation(0.025);
    }
    return;
  }

  if (message.session !== session) return;

  if (message.type === "retarget") {
    anchors = message.anchors;
    vectors = message.vectors;
    vectorSize = message.vectorSize;
    visibleIndices = message.visibleIndices;
    rebuildVisibleMask();
    rebuildLinks();
    wakeSimulation(0.010 + clamp01(settings.motion) * 0.018);
    return;
  }

  if (message.type === "visibility") {
    visibleIndices = message.visibleIndices;
    rebuildVisibleMask();
    rebuildLinks();
    wakeSimulation(0.002);
    return;
  }
};
