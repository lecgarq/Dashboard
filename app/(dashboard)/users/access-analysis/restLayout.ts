/**
 * restLayout.ts — Static, deterministic "gentle real grouping" cloud for the 0-slider
 * state. Same-project nodes seed near each other; a light collide+charge settle yields
 * soft, non-circular clumps (no rescale to a fixed circle; denser center, thinning edge).
 * Computed ONCE on load → zero runtime cost. Pure & deterministic (no RNG/clock).
 */
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TICKS = 160;
const NODE_R = 5; // collide radius per node (soft personal space)
const SEED_SPREAD = 1400; // global phyllotaxis radius before relaxation
const CLUMP_SPREAD = 70; // intra-project jitter radius around each project's seed
const CENTER_STRENGTH = 0.02;
const MAX_EXTENT = 1900; // safety: scale DOWN only if it would overflow GPU space

interface RNode {
  x: number;
  y: number;
}

export function buildRestLayout(features: ReadonlyArray<NodeFeatureSnapshot>): Float32Array {
  const n = features.length;
  const out = new Float32Array(n * 3);
  if (n === 0) return out;

  // Distinct projects in first-seen order → a phyllotaxis seed per project (denser center).
  const projOrder = new Map<string, number>();
  for (const f of features) {
    const p = f.project ?? "(none)";
    if (!projOrder.has(p)) projOrder.set(p, projOrder.size);
  }
  const np = projOrder.size;
  const projSeed = new Map<string, { x: number; y: number }>();
  for (const [p, idx] of projOrder) {
    const rr = SEED_SPREAD * Math.sqrt((idx + 0.5) / np);
    const th = idx * GOLDEN_ANGLE;
    projSeed.set(p, { x: Math.cos(th) * rr, y: Math.sin(th) * rr });
  }

  // Each node seeded near its project's seed (deterministic per-node phyllotaxis offset).
  const perProjSeen = new Map<string, number>();
  const nodes: RNode[] = features.map((f) => {
    const p = f.project ?? "(none)";
    const s = projSeed.get(p)!;
    const j = perProjSeen.get(p) ?? 0;
    perProjSeen.set(p, j + 1);
    const rr = CLUMP_SPREAD * Math.sqrt((j + 0.5) / (j + 1));
    const th = j * GOLDEN_ANGLE;
    return { x: s.x + Math.cos(th) * rr, y: s.y + Math.sin(th) * rr };
  });

  const sim = forceSimulation<RNode>(nodes)
    .force("collide", forceCollide<RNode>(NODE_R).strength(0.8).iterations(2))
    .force("charge", forceManyBody<RNode>().strength(-2).distanceMax(120))
    .force("x", forceX<RNode>(0).strength(CENTER_STRENGTH))
    .force("y", forceY<RNode>(0).strength(CENTER_STRENGTH))
    .stop();
  for (let t = 0; t < TICKS; t++) sim.tick();

  let mx = 0;
  let my = 0;
  for (const nd of nodes) {
    mx += nd.x;
    my += nd.y;
  }
  mx /= n;
  my /= n;
  let reach = 1;
  for (const nd of nodes) reach = Math.max(reach, Math.hypot(nd.x - mx, nd.y - my));
  const scale = Math.min(1, MAX_EXTENT / reach);
  for (let i = 0; i < n; i++) {
    out[i * 3] = (nodes[i].x - mx) * scale;
    out[i * 3 + 1] = (nodes[i].y - my) * scale;
    out[i * 3 + 2] = 0;
  }
  return out;
}
