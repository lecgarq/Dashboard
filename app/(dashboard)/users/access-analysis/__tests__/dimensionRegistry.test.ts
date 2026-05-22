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
    moduleSignature: ["build"],
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

  it("registers the first-batch dimensions incl. isAdmin + module (A2)", () => {
    expect(DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "company", "activity", "signin", "isAdmin", "module",
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

describe("dimension registry — module (multi-hot)", () => {
  it("extract returns the moduleSignature array; [] when absent", () => {
    expect(getDimension("module")!.extract(snap({ moduleSignature: ["build", "cost"] }))).toEqual(["build", "cost"]);
    expect(getDimension("module")!.extract(snap({ moduleSignature: undefined }))).toEqual([]);
  });
  it("isAvailable is true only for a non-empty signature", () => {
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: ["build"] }))).toBe(true);
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: [] }))).toBe(false);
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: undefined }))).toBe(false);
  });
  it("module is typed multi-hot with availability A2", () => {
    const d = getDimension("module")!;
    expect(d.type).toBe("multi-hot");
    expect(d.availability).toBe("A2");
  });
});

import {
  RUNTIME_DIMENSION_IDS,
  RUNTIME_TARGET_DIMENSION_IDS,
  MULTI_HOT_DIMENSION_IDS,
  getRuntimeDimensions,
  runtimeDefaultSliders,
} from "../dimensionRegistry";

describe("dimension registry — runtime view", () => {
  it("RUNTIME_DIMENSION_IDS is the 6 wired runtime dims, in display order", () => {
    expect(RUNTIME_DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "activity", "signin",
    ]);
  });

  it("every runtime id resolves to a registered descriptor", () => {
    for (const id of RUNTIME_DIMENSION_IDS) {
      expect(getDimension(id)).toBeDefined();
    }
  });

  it("getRuntimeDimensions returns descriptors in RUNTIME_DIMENSION_IDS order", () => {
    expect(getRuntimeDimensions().map((d) => d.id)).toEqual([...RUNTIME_DIMENSION_IDS]);
  });

  it("runtimeDefaultSliders maps defaultWeight×100 to each runtime id", () => {
    expect(runtimeDefaultSliders()).toEqual({
      project: 35, role: 25, tier: 15, internalExternal: 10, activity: 5, signin: 5,
    });
  });

  it("MULTI_HOT_DIMENSION_IDS contains the multi-hot dims (module)", () => {
    expect(MULTI_HOT_DIMENSION_IDS).toContain("module");
    // every entry is genuinely typed multi-hot in the registry
    for (const id of MULTI_HOT_DIMENSION_IDS) {
      expect(getDimension(id)!.type).toBe("multi-hot");
    }
  });
});

describe("dimension registry — target vs slider runtime sets", () => {
  // P4: RUNTIME_TARGET_DIMENSION_IDS is now the full slider-capable set (all 9 dims in
  // registry order). The old target-only tail (module appended to RUNTIME_DIMENSION_IDS)
  // is gone — module is a first-class slider.
  it("RUNTIME_TARGET_DIMENSION_IDS equals the full slider-capable set in registry order", () => {
    expect(RUNTIME_TARGET_DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "company", "activity", "signin", "isAdmin", "module",
    ]);
  });
  it("RUNTIME_DIMENSION_IDS (primary 6) does not contain module; RUNTIME_TARGET_DIMENSION_IDS does", () => {
    expect(RUNTIME_DIMENSION_IDS).not.toContain("module");
    expect(RUNTIME_TARGET_DIMENSION_IDS).toContain("module");
  });
});

import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("dimension registry — P4 module promotion", () => {
  it("module is slider-capable (in SLIDER_DIMENSION_IDS)", () => {
    expect(SLIDER_DIMENSION_IDS).toContain("module");
  });
  it("RUNTIME_TARGET_DIMENSION_IDS equals the full slider set (no target-only tail)", () => {
    expect([...RUNTIME_TARGET_DIMENSION_IDS].sort()).toEqual([...SLIDER_DIMENSION_IDS].sort());
  });
});
