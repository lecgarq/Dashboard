// app/(dashboard)/users/access-analysis/d3-force-3d.d.ts
// d3-force-3d has no bundled types and no @types/ package (verified 2026-05-19).
// This shim exposes the subset used by physicsLayer.ts.
// Lives alongside physicsLayer.ts so Next.js tsconfig include paths pick it up automatically.

declare module "d3-force-3d" {
  import type {
    SimulationNodeDatum,
    SimulationLinkDatum,
    Force,
  } from "d3-force";

  export interface SimNode3D extends SimulationNodeDatum {
    z?: number;
    vz?: number;
    fz?: number | null;
  }

  export type Simulation3D<N extends SimNode3D> = {
    nodes(): N[];
    nodes(nodes: N[]): Simulation3D<N>;
    alpha(): number;
    alpha(alpha: number): Simulation3D<N>;
    alphaMin(): number;
    alphaMin(min: number): Simulation3D<N>;
    alphaDecay(): number;
    alphaDecay(decay: number): Simulation3D<N>;
    alphaTarget(): number;
    alphaTarget(target: number): Simulation3D<N>;
    velocityDecay(): number;
    velocityDecay(decay: number): Simulation3D<N>;
    numDimensions(): number;
    numDimensions(dims: 1 | 2 | 3): Simulation3D<N>;
    force(name: string): Force<N, SimulationLinkDatum<N>> | null;
    force(name: string, force: Force<N, SimulationLinkDatum<N>> | null): Simulation3D<N>;
    on(typenames: "tick" | "end", listener: () => void): Simulation3D<N>;
    on(typenames: "tick" | "end"): (() => void) | undefined;
    tick(iterations?: number): Simulation3D<N>;
    restart(): Simulation3D<N>;
    stop(): Simulation3D<N>;
    find(x: number, y: number, z?: number, radius?: number): N | undefined;
  };

  export type Force3DX<N extends SimNode3D> = {
    (alpha: number): void;
    initialize(nodes: N[], random: () => number): void;
    strength(): number;
    strength(s: number | ((d: N, i: number) => number)): Force3DX<N>;
    x(): ((d: N) => number) | number;
    x(x: number | ((d: N) => number)): Force3DX<N>;
  } & Force<N, SimulationLinkDatum<N>>;

  export type Force3DY<N extends SimNode3D> = Force3DX<N>;
  export type Force3DZ<N extends SimNode3D> = Force3DX<N>;

  export type ForceManyBody3D<N extends SimNode3D> = {
    (alpha: number): void;
    initialize(nodes: N[], random: () => number): void;
    strength(): number;
    strength(s: number | ((d: N) => number)): ForceManyBody3D<N>;
    theta(): number;
    theta(t: number): ForceManyBody3D<N>;
    distanceMin(): number;
    distanceMin(d: number): ForceManyBody3D<N>;
    distanceMax(): number;
    distanceMax(d: number): ForceManyBody3D<N>;
  } & Force<N, SimulationLinkDatum<N>>;

  export function forceSimulation<N extends SimNode3D>(
    nodes?: N[],
    numDimensions?: 1 | 2 | 3,
  ): Simulation3D<N>;

  export function forceX<N extends SimNode3D>(x?: number | ((d: N) => number)): Force3DX<N>;
  export function forceY<N extends SimNode3D>(y?: number | ((d: N) => number)): Force3DY<N>;
  export function forceZ<N extends SimNode3D>(z?: number | ((d: N) => number)): Force3DZ<N>;
  export function forceManyBody<N extends SimNode3D>(): ForceManyBody3D<N>;
}
