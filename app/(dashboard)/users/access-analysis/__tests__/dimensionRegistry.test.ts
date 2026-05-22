import { describe, it, expect } from "vitest";
import {
  DIMENSION_REGISTRY,
  DIMENSION_IDS,
  CONFIDENCE_FACTOR,
  getDimension,
  type DimensionId,
} from "../dimensionRegistry";
import { categoryValue, type TargetDimensionId } from "../featureTargets";
import type { NodeFeatureSnapshot } from "../interactionTypes";

/** A fully-populated snapshot; override per assertion. */
function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "ada lovelace",
    emailLower: "ada@hermosillo.com",
    project: "Tower A",
    role: "Architect",
    permTier: "View Only",
    isExternal: false,
    affiliation: "internal",
    activityBucket: "Med",
    signinBucket: "<30d",
    activityCountRaw: 42,
    lastSignInRel: "12d ago",
    permissionCoverage: "known",
    firmName: "Hermosillo",
    accountStatus: "active",
    isAdmin: false,
    ...over,
  };
}

describe("dimension registry — validity", () => {
  it("has unique ids and DIMENSION_IDS mirrors the registry", () => {
    const ids = DIMENSION_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DIMENSION_IDS).toEqual(ids);
  });

  it("every descriptor has a non-empty label, source, default weight in [0,1], valid confidence", () => {
    for (const d of DIMENSION_REGISTRY) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.source.length).toBeGreaterThan(0);
      expect(d.defaultWeight).toBeGreaterThanOrEqual(0);
      expect(d.defaultWeight).toBeLessThanOrEqual(1);
      expect(["high", "medium", "low"]).toContain(d.confidence);
    }
  });

  it("CONFIDENCE_FACTOR maps each level to its taxonomy weight", () => {
    expect(CONFIDENCE_FACTOR).toEqual({ high: 1.0, medium: 0.7, low: 0.4 });
  });

  it("getDimension finds by id and returns undefined for unknown", () => {
    expect(getDimension("project")?.id).toBe("project");
    expect(getDimension("nope" as DimensionId)).toBeUndefined();
  });

  it("registers the first-batch dimensions incl. isAdmin (module added in Task 3)", () => {
    expect(DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "company", "activity", "signin", "isAdmin",
    ]);
  });
});

describe("dimension registry — extract", () => {
  it("categorical dims read the expected snapshot field", () => {
    const f = snap();
    expect(getDimension("project")!.extract(f)).toBe("Tower A");
    expect(getDimension("role")!.extract(f)).toBe("Architect");
    expect(getDimension("tier")!.extract(f)).toBe("View Only");
    expect(getDimension("internalExternal")!.extract(f)).toBe("internal");
    expect(getDimension("company")!.extract(f)).toBe("Hermosillo");
    expect(getDimension("activity")!.extract(f)).toBe("Med");
    expect(getDimension("signin")!.extract(f)).toBe("<30d");
  });

  it("tier falls back to '(none)' when permTier is null", () => {
    expect(getDimension("tier")!.extract(snap({ permTier: null }))).toBe("(none)");
  });

  it("internalExternal returns the 3-way affiliation incl. unknown", () => {
    expect(getDimension("internalExternal")!.extract(snap({ affiliation: "unknown" }))).toBe("unknown");
    expect(getDimension("internalExternal")!.extract(snap({ affiliation: "external" }))).toBe("external");
  });

  it("company returns null when there is no firm", () => {
    expect(getDimension("company")!.extract(snap({ firmName: "" }))).toBeNull();
  });

  it("isAdmin extracts 'admin' / 'member' (undefined → 'member')", () => {
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: true }))).toBe("admin");
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: false }))).toBe("member");
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: undefined }))).toBe("member");
  });
});

describe("dimension registry — isAvailable (weighting availability gate)", () => {
  it("gates unknown/absent values to false", () => {
    expect(getDimension("company")!.isAvailable(snap({ firmName: "" }))).toBe(false);
    expect(getDimension("company")!.isAvailable(snap({ firmName: "ACME" }))).toBe(true);
    expect(getDimension("internalExternal")!.isAvailable(snap({ affiliation: "unknown" }))).toBe(false);
    expect(getDimension("internalExternal")!.isAvailable(snap({ affiliation: "internal" }))).toBe(true);
    expect(getDimension("tier")!.isAvailable(snap({ permissionCoverage: "unknown", permTier: null }))).toBe(false);
    expect(getDimension("tier")!.isAvailable(snap({ permissionCoverage: "known", permTier: "View Only" }))).toBe(true);
    expect(getDimension("activity")!.isAvailable(snap({ activityBucket: "None" }))).toBe(false);
    expect(getDimension("activity")!.isAvailable(snap({ activityBucket: "Med" }))).toBe(true);
  });

  it("isAdmin is always available (binary: both poles are real)", () => {
    expect(getDimension("isAdmin")!.isAvailable(snap({ isAdmin: true }))).toBe(true);
    expect(getDimension("isAdmin")!.isAvailable(snap({ isAdmin: false }))).toBe(true);
  });
});

describe("dimension registry — drift guard vs featureTargets.categoryValue", () => {
  // The 5 ids shared with the legacy featureTargets dimension set MUST extract the
  // same categorical string, so the two registries cannot silently diverge.
  const shared: Array<DimensionId & TargetDimensionId> = [
    "project", "role", "tier", "activity", "signin",
  ];
  const samples: NodeFeatureSnapshot[] = [
    snap(),
    snap({ permTier: null, activityBucket: "None", signinBucket: ">90d" }),
    snap({ role: "(no role)", project: "(unknown)" }),
  ];
  it("matches categoryValue for every shared id across sample snapshots", () => {
    for (const id of shared) {
      for (const f of samples) {
        expect(getDimension(id)!.extract(f)).toBe(categoryValue(f, id));
      }
    }
  });
});
