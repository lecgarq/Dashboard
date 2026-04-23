// Force-directed graph physics — extracted from AccUsersGraph so it can run in a Web Worker
// off the main thread. The component still owns buildGraph / normalizePositions since those
// are cheap and type-coupled to the UI.

export interface PhysicsNode {
  id: string;
  kind: "instance" | "user" | "role" | "module";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PhysicsEdge {
  source: string;
  target: string;
  weight: number;
}

export const SIM_WIDTH = 6000;
export const SIM_HEIGHT = 6000;

const SIM_ITERATIONS = 130;
const REPULSION = 2200;
const ATTRACTION = 0.07;
const DAMPING = 0.72;
const CENTER_GRAVITY = 0.022;
const REPULSION_GRID = 450;

// Grid-based O(n×k) repulsion, weighted edges. Hubs barely move so they anchor clusters.
export function runSimulation<T extends PhysicsNode>(nodes: T[], edges: PhysicsEdge[]): T[] {
  const ns: T[] = nodes.map((n) => ({ ...n }));
  const cx = SIM_WIDTH / 2, cy = SIM_HEIGHT / 2;
  const idxMap = new Map(ns.map((n, i) => [n.id, i]));

  const isHub = (n: PhysicsNode) => n.kind === "role" || n.kind === "module";

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const fx = new Float64Array(ns.length);
    const fy = new Float64Array(ns.length);

    const grid = new Map<string, number[]>();
    for (let i = 0; i < ns.length; i++) {
      const gx = Math.floor(ns[i].x / REPULSION_GRID);
      const gy = Math.floor(ns[i].y / REPULSION_GRID);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(i);
    }

    for (let i = 0; i < ns.length; i++) {
      const gx = Math.floor(ns[i].x / REPULSION_GRID);
      const gy = Math.floor(ns[i].y / REPULSION_GRID);
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const cell = grid.get(`${gx + ox},${gy + oy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const dx = ns[j].x - ns[i].x || 0.01;
            const dy = ns[j].y - ns[i].y || 0.01;
            const dist2 = dx * dx + dy * dy;
            const dist = Math.sqrt(dist2) || 0.01;
            const force = REPULSION / dist2;
            const fx_ = (dx / dist) * force, fy_ = (dy / dist) * force;
            fx[i] -= fx_; fy[i] -= fy_;
            fx[j] += fx_; fy[j] += fy_;
          }
        }
      }
    }

    for (const e of edges) {
      const si = idxMap.get(e.source) ?? -1;
      const ti = idxMap.get(e.target) ?? -1;
      if (si < 0 || ti < 0) continue;
      const dx = ns[ti].x - ns[si].x, dy = ns[ti].y - ns[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = dist * ATTRACTION * e.weight;
      const fx_ = (dx / dist) * f, fy_ = (dy / dist) * f;
      fx[si] += fx_; fy[si] += fy_;
      if (!isHub(ns[ti])) { fx[ti] -= fx_; fy[ti] -= fy_; }
      else { fx[ti] -= fx_ * 0.04; fy[ti] -= fy_ * 0.04; }
    }

    for (let i = 0; i < ns.length; i++) {
      fx[i] += (cx - ns[i].x) * CENTER_GRAVITY;
      fy[i] += (cy - ns[i].y) * CENTER_GRAVITY;
    }

    for (let i = 0; i < ns.length; i++) {
      ns[i].vx = (ns[i].vx + fx[i]) * DAMPING;
      ns[i].vy = (ns[i].vy + fy[i]) * DAMPING;
      ns[i].x += ns[i].vx;
      ns[i].y += ns[i].vy;
    }
  }

  return ns;
}
