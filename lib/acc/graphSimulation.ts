// Force-directed ACC graph physics shared by the users graph.
// Phase 1 still runs layout on the CPU; only drawing changes backend.

export interface PhysicsNode {
  id: string;
  kind: "instance" | "user" | "project" | "role" | "module";
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

// Grid-based O(n x k) repulsion, weighted edges. Hubs barely move so they anchor clusters.
export function runSimulation<T extends PhysicsNode>(nodes: T[], edges: PhysicsEdge[]): T[] {
  const simNodes: T[] = nodes.map((node) => ({ ...node }));
  const cx = SIM_WIDTH / 2;
  const cy = SIM_HEIGHT / 2;
  const indexMap = new Map(simNodes.map((node, index) => [node.id, index]));

  const isHub = (node: PhysicsNode) => node.kind === "project" || node.kind === "role" || node.kind === "module";

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const fx = new Float64Array(simNodes.length);
    const fy = new Float64Array(simNodes.length);

    const grid = new Map<string, number[]>();
    for (let i = 0; i < simNodes.length; i++) {
      const gx = Math.floor(simNodes[i].x / REPULSION_GRID);
      const gy = Math.floor(simNodes[i].y / REPULSION_GRID);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(i);
    }

    for (let i = 0; i < simNodes.length; i++) {
      const gx = Math.floor(simNodes[i].x / REPULSION_GRID);
      const gy = Math.floor(simNodes[i].y / REPULSION_GRID);
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const cell = grid.get(`${gx + ox},${gy + oy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const dx = simNodes[j].x - simNodes[i].x || 0.01;
            const dy = simNodes[j].y - simNodes[i].y || 0.01;
            const dist2 = dx * dx + dy * dy;
            const dist = Math.sqrt(dist2) || 0.01;
            const force = REPULSION / dist2;
            const fxStep = (dx / dist) * force;
            const fyStep = (dy / dist) * force;
            fx[i] -= fxStep;
            fy[i] -= fyStep;
            fx[j] += fxStep;
            fy[j] += fyStep;
          }
        }
      }
    }

    for (const edge of edges) {
      const sourceIndex = indexMap.get(edge.source) ?? -1;
      const targetIndex = indexMap.get(edge.target) ?? -1;
      if (sourceIndex < 0 || targetIndex < 0) continue;

      const dx = simNodes[targetIndex].x - simNodes[sourceIndex].x;
      const dy = simNodes[targetIndex].y - simNodes[sourceIndex].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = dist * ATTRACTION * edge.weight;
      const fxStep = (dx / dist) * force;
      const fyStep = (dy / dist) * force;
      fx[sourceIndex] += fxStep;
      fy[sourceIndex] += fyStep;

      if (!isHub(simNodes[targetIndex])) {
        fx[targetIndex] -= fxStep;
        fy[targetIndex] -= fyStep;
      } else {
        fx[targetIndex] -= fxStep * 0.04;
        fy[targetIndex] -= fyStep * 0.04;
      }
    }

    for (let i = 0; i < simNodes.length; i++) {
      fx[i] += (cx - simNodes[i].x) * CENTER_GRAVITY;
      fy[i] += (cy - simNodes[i].y) * CENTER_GRAVITY;
    }

    for (let i = 0; i < simNodes.length; i++) {
      simNodes[i].vx = (simNodes[i].vx + fx[i]) * DAMPING;
      simNodes[i].vy = (simNodes[i].vy + fy[i]) * DAMPING;
      simNodes[i].x += simNodes[i].vx;
      simNodes[i].y += simNodes[i].vy;
    }
  }

  return simNodes;
}
