/**
 * physicsClustering.test.ts — deterministic integration proof that feature targets
 * actually produce spatial clustering once the REAL d3-force simulation settles.
 *
 * This is the MATHEMATICAL proof for P1.1 (the e2e suite owns only the
 * product smoke/regression). It runs entirely in node:
 *   - real d3-force-3d (captured so we drive deterministic ticks),
 *   - mocked DuckDB + positions cache (forced cache miss),
 *   - Math.random reseeded to a fixed value before every settle, so every layout
 *     starts from identical seeds and results are fully deterministic.
 *
 * Small synthetic dataset (≤ 2,000 nodes) — no browser, no Playwright, no real
 * 16,934-node load.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./duckdbClient", () => ({
  getDuckDbClient: vi.fn(async () => ({ connection: {} as any, db: {} as any })),
}));

vi.mock("./positionsCache", () => ({
  savePositions: vi.fn(async () => undefined),
  loadCachedPositions: vi.fn(async () => null as Float32Array | null),
  hashNodeSetAndSliders: vi.fn(() => "test-key"),
}));

let _capturedSim: any = null;
vi.mock("d3-force-3d", async (importOriginal) => {
  const real = await importOriginal<typeof import("d3-force-3d")>();
  return {
    ...real,
    forceSimulation: (...args: any[]) => {
      const sim = (real.forceSimulation as any)(...args);
      _capturedSim = sim;
      return sim;
    },
  };
});

import { createPhysicsLayer, type SimNode } from "./physicsLayer";
import { buildFeatureTargets, TARGET_DIMENSIONS } from "./featureTargets";
import { computeAxisRanges, computeClusteringRatio } from "./layoutStats";
import { DEFAULT_VALUES } from "./SliderContext";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const FIXED_SEED = 0x12345678;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Reinstall a deterministic Math.random from a fixed seed (controlled comparisons). */
function reseedRandom(): void {
  let s = FIXED_SEED >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  });
}

function makeFeature(over: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return {
    nodeId: "n",
    nameLower: "",
    emailLower: "",
    project: "P0",
    role: "Architect",
    permTier: "view",
    isExternal: false,
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "active",
    ...over,
  };
}

/** Synthetic graph: K projects × competing multi-category dims. Deterministic. */
function buildFixture(n: number, kProjects: number) {
  const roles = ["Architect", "Engineer", "PM", "Viewer", "Admin"];
  const tiers = ["view", "edit", "control", "none"];
  const acts = ["None", "Low", "Med", "High"] as const;
  const signs = ["<7d", "<30d", "<90d", ">90d"] as const;
  const features: NodeFeatureSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const project = `P${i % kProjects}`;
    features.push(
      makeFeature({
        nodeId: `${project}::n${i}`,
        project,
        role: roles[i % roles.length],
        permTier: tiers[(i * 7) % tiers.length],
        isExternal: i % 3 === 0,
        activityBucket: acts[(i * 3) % acts.length],
        signinBucket: signs[(i * 5) % signs.length],
      }),
    );
  }
  return features;
}

/** Settle the layout for a slider profile and return positions + project categories. */
async function settle(
  features: NodeFeatureSnapshot[],
  sliders: Record<string, number>,
): Promise<{ xyz: Float32Array; projects: string[] }> {
  reseedRandom();
  _capturedSim = null;
  const nodeIds = features.map((f) => f.nodeId);
  const nodes: SimNode[] = nodeIds.map((id, index) => ({ id, index }));
  const targets = buildFeatureTargets(features); // uses the production ANCHOR_RADIUS
  const physics = await createPhysicsLayer(nodeIds, nodes, targets, [...TARGET_DIMENSIONS], sliders);
  const sim = _capturedSim;
  sim.stop();
  for (let i = 0; i < 300; i++) sim.tick();
  return { xyz: physics.getPositions(), projects: features.map((f) => f.project) };
}

const ZERO = { role: 0, tier: 0, project: 0, isExternal: 0, activity: 0, signin: 0 };
const DEFAULT_NORM = Object.fromEntries(
  Object.entries(DEFAULT_VALUES).map(([k, v]) => [k, v / 100]),
) as Record<string, number>;
const PROJECT_MAX = { ...ZERO, project: 1 };

describe("feature targets produce real spatial clustering after settle", () => {
  it("clustering increases globe < default < project-max, and project-max is strong", async () => {
    const features = buildFixture(720, 12);

    const globe = await settle(features, ZERO);
    const def = await settle(features, DEFAULT_NORM);
    const high = await settle(features, PROJECT_MAX);

    const rGlobe = computeClusteringRatio(globe.xyz, globe.projects).ratio;
    const rDefault = computeClusteringRatio(def.xyz, def.projects).ratio;
    const rHigh = computeClusteringRatio(high.xyz, high.projects).ratio;

    // eslint-disable-next-line no-console
    console.log(`[clustering] globe=${rGlobe.toFixed(3)} default=${rDefault.toFixed(3)} high=${rHigh.toFixed(3)}`);

    // The default profile is structured — measurably better than a pure-repulsion globe.
    expect(rDefault).toBeGreaterThan(rGlobe);
    // Raising the project slider strengthens project clustering further.
    expect(rHigh).toBeGreaterThan(rDefault);
    // A project-dominated layout groups same-project nodes clearly.
    expect(rHigh).toBeGreaterThan(1.3);
    // Globe baseline carries essentially no project structure.
    expect(rGlobe).toBeLessThan(1.15);
  }, 30_000);

  it("settled layout is volumetric with meaningful depth and no NaN/Infinity", async () => {
    const features = buildFixture(720, 12);
    const { xyz } = await settle(features, DEFAULT_NORM);
    const r = computeAxisRanges(xyz);
    expect(r.anyNaN).toBe(false);
    expect(r.nodeCount).toBe(features.length);
    expect(r.xRange).toBeGreaterThan(0);
    expect(r.yRange).toBeGreaterThan(0);
    expect(r.zRange).toBeGreaterThan(0);
    // Depth is comparable to width/height — not a flat disc.
    expect(r.zRange).toBeGreaterThan(0.2 * Math.max(r.xRange, r.yRange));
  }, 30_000);

  it("is deterministic: identical inputs produce an identical clustering ratio", async () => {
    const features = buildFixture(500, 10);
    const a = await settle(features, DEFAULT_NORM);
    const b = await settle(features, DEFAULT_NORM);
    expect(computeClusteringRatio(a.xyz, a.projects).ratio).toBe(
      computeClusteringRatio(b.xyz, b.projects).ratio,
    );
  }, 30_000);
});
