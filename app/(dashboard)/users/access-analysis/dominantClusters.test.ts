import { describe, it, expect } from "vitest";
import {
  dominantCatalogDim,
  buildDominantClusters,
  clusterPositions2D,
} from "./dominantClusters";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function snap(over: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
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
  } as NodeFeatureSnapshot;
}

function dim(over: Partial<CatalogDimension>): CatalogDimension {
  return {
    id: "role",
    label: "Role",
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available: true,
    surfaces: ["slider"],
    extract: (f) => f.role ?? null,
    ...over,
  } as CatalogDimension;
}

describe("dominantCatalogDim", () => {
  const role = dim({ id: "role" });
  const project = dim({ id: "project", label: "Project", extract: (f) => f.project ?? null });

  it("returns null when no slider is engaged", () => {
    expect(dominantCatalogDim([role, project], { role: 0, project: 0 })).toBeNull();
    expect(dominantCatalogDim([role, project], {})).toBeNull();
  });

  it("returns the highest-valued engaged dim", () => {
    expect(dominantCatalogDim([role, project], { role: 0.3, project: 1 })?.id).toBe("project");
  });

  it("breaks ties by smallest id", () => {
    // role vs project both 1 → "project" > "role" lexicographically → role wins
    expect(dominantCatalogDim([project, role], { role: 1, project: 1 })?.id).toBe("project");
    const a = dim({ id: "aaa" });
    const z = dim({ id: "zzz" });
    expect(dominantCatalogDim([z, a], { aaa: 1, zzz: 1 })?.id).toBe("aaa");
  });
});

describe("buildDominantClusters", () => {
  it("groups by a categorical value, one cluster per distinct value", () => {
    const role = dim({ id: "role" });
    const feats = [
      snap({ role: "Architect" }),
      snap({ role: "Engineer" }),
      snap({ role: "Architect" }),
      snap({ role: "PM" }),
    ];
    const { ids, labels, counts } = buildDominantClusters(feats, role);
    expect(Array.from(ids)).toEqual([0, 1, 0, 2]);
    expect(labels).toEqual(["Architect", "Engineer", "PM"]);
    expect(counts).toEqual([2, 1, 1]);
  });

  it("produces MANY clusters for a high-cardinality categorical (project)", () => {
    const project = dim({ id: "project", extract: (f) => f.project ?? null });
    const feats = Array.from({ length: 300 }, (_, i) => snap({ project: `P${i % 120}` }));
    const { labels } = buildDominantClusters(feats, project);
    expect(labels.length).toBe(120); // one blob per distinct project, not one big pile
  });

  it("labels ordinal permission buckets readably", () => {
    const perm = dim({ id: "permission", label: "Permission", kind: "ordinal", extract: () => 0 });
    const feats = [
      snap({ permissionStrength: 0 }),
      snap({ permissionStrength: 4 }),
      snap({ permissionStrength: 4 }),
    ];
    const { ids, labels } = buildDominantClusters(feats, perm);
    expect(Array.from(ids)).toEqual([0, 1, 1]);
    expect(labels).toEqual(["Permission 0", "Permission 4"]);
  });

  it("maps a null categorical value to a single (none) cluster", () => {
    const d = dim({ id: "firm", extract: () => null });
    const { labels } = buildDominantClusters([snap({}), snap({})], d);
    expect(labels).toEqual(["(none)"]);
  });
});

describe("clusterPositions2D", () => {
  it("returns count*2 coordinates", () => {
    expect(clusterPositions2D(5).length).toBe(10);
    expect(clusterPositions2D(0).length).toBe(0);
  });

  it("places a single cluster at the origin", () => {
    expect(Array.from(clusterPositions2D(1))).toEqual([0, 0]);
  });

  it("spreads clusters across a disc (not a ring): inner clusters are nearer the centre", () => {
    const p = clusterPositions2D(50);
    const r0 = Math.hypot(p[0], p[1]); // first (innermost) cluster
    const rLast = Math.hypot(p[98], p[99]); // last (outermost) cluster
    expect(r0).toBeLessThan(rLast); // radius grows → filled disc, not all on one ring
    expect(r0).toBeGreaterThanOrEqual(0);
  });

  it("fills a FIXED disc regardless of count (anchors stay within cosmos spaceSize)", () => {
    // Outermost cluster radius ≈ DISC_RADIUS (1700) for any count, so anchors
    // never exceed the engine's spaceSize/2 (2048) — count only changes density.
    const small = clusterPositions2D(16);
    const big = clusterPositions2D(1024);
    const rSmall = Math.hypot(small[30], small[31]); // outermost of 16
    const rBig = Math.hypot(big[2046], big[2047]); // outermost of 1024
    expect(rSmall).toBeGreaterThan(1600);
    expect(rSmall).toBeLessThan(1750);
    expect(rBig).toBeGreaterThan(1600);
    expect(rBig).toBeLessThan(1750);
  });

  it("is deterministic", () => {
    expect(Array.from(clusterPositions2D(20))).toEqual(Array.from(clusterPositions2D(20)));
  });
});

describe("buildDominantClusters — multiHot keying (moduleAccess)", () => {
  // A multiHot dim whose value is a SET derived from an existing field, so the
  // test is independent of the WIP snapshot shape. Same set in any order must be
  // one cluster; a different/subset set must be a different cluster.
  const multi = dim({
    id: "moduleAccess",
    label: "Module access",
    kind: "multiHot",
    extract: (f) => (f.project ? f.project.split("+").sort() : []),
  });

  it("treats the same set in any order as one cluster, different sets as different", () => {
    const feats = [
      snap({ project: "docs+build" }),
      snap({ project: "build+docs" }), // same set, different order
      snap({ project: "docs" }), // subset → different cluster
    ];
    const { ids } = buildDominantClusters(feats, multi);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(ids[2]);
  });
});
