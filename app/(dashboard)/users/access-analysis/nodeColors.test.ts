import { describe, it, expect } from "vitest";
import {
  COLOR_MODES,
  COLOR_MODE_LABELS,
  categoryForColor,
  buildNodeColors,
  buildClusterAssignment,
  migrateColorMode,
  type ColorMode,
} from "./nodeColors";
import { getDimension } from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function feature(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "",
    emailLower: "",
    project: "Project A",
    role: "Architect",
    permTier: "view",
    isExternal: false,
    affiliation: "internal",
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "active",
    isAdmin: false,
    moduleSignature: [],
    ...over,
  };
}

/** Alias used by the new registry-derived tests (richer defaults). */
function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return feature({
    project: "Tower A",
    role: "Architect",
    permTier: "View Only",
    affiliation: "internal",
    activityBucket: "Med",
    signinBucket: "<30d",
    activityCountRaw: 1,
    lastSignInRel: "",
    permissionCoverage: "known",
    firmName: "Hermosillo",
    accountStatus: "active",
    isAdmin: false,
    moduleSignature: ["build"],
    ...over,
  });
}

function rgba(buf: Float32Array, i: number): [number, number, number, number] {
  return [buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3]];
}

function inUnitRange(buf: Float32Array): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (!Number.isFinite(buf[i]) || buf[i] < 0 || buf[i] > 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// categoryForColor
// ---------------------------------------------------------------------------

describe("categoryForColor", () => {
  it("maps each mode to its categorical feature field", () => {
    const f = feature({
      role: "Engineer",
      permTier: "edit",
      accountStatus: "inactive",
      isExternal: true,
      affiliation: "external",
    });
    expect(categoryForColor(f, "role")).toBe("Engineer");
    expect(categoryForColor(f, "tier")).toBe("edit");
    expect(categoryForColor(f, "status")).toBe("inactive");
    // internalExternal replaces the legacy external mode
    expect(categoryForColor(f, "internalExternal")).toBe("external");
  });

  it("uses stable placeholders for missing tier / status", () => {
    expect(categoryForColor(feature({ permTier: null }), "tier")).toBe("(none)");
    expect(categoryForColor(feature({ accountStatus: "" }), "status")).toBe("(unknown)");
  });
});

describe("color mode metadata", () => {
  it("leads with cluster (color == spatial group is the embedding-projector default)", () => {
    expect(COLOR_MODES[0]).toBe("cluster");
  });

  it("has company second and role third", () => {
    expect(COLOR_MODES[1]).toBe("company");
    expect(COLOR_MODES[2]).toBe("role");
  });

  it("exposes internalExternal (not legacy external) as a selectable mode", () => {
    expect(COLOR_MODES).toContain("internalExternal");
    expect(COLOR_MODES).not.toContain("external");
  });

  it("provides a non-empty label for every mode", () => {
    for (const mode of COLOR_MODES) {
      expect(COLOR_MODE_LABELS[mode]).toBeTruthy();
      expect(typeof COLOR_MODE_LABELS[mode]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// buildNodeColors — shape invariants
// ---------------------------------------------------------------------------

describe("buildNodeColors shape", () => {
  const features = [feature({ role: "A" }), feature({ role: "B" }), feature({ role: "C" })];

  it("returns an RGBA buffer of length n*4", () => {
    const buf = buildNodeColors(features, "role");
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(features.length * 4);
  });

  it("sets alpha to 1 for every node (dimming is a mask concern, not color)", () => {
    const buf = buildNodeColors(features, "role");
    for (let i = 0; i < features.length; i++) {
      expect(buf[i * 4 + 3]).toBe(1);
    }
  });

  it("keeps all channels within [0,1]", () => {
    for (const mode of COLOR_MODES) {
      expect(inUnitRange(buildNodeColors(features, mode))).toBe(true);
    }
  });

  it("handles an empty feature list", () => {
    expect(buildNodeColors([], "role").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildNodeColors — determinism + semantics
// ---------------------------------------------------------------------------

describe("buildNodeColors determinism", () => {
  const features = [
    feature({ role: "A", permTier: "view", accountStatus: "active" }),
    feature({ role: "B", permTier: "edit", accountStatus: "inactive" }),
    feature({ role: "A", permTier: "view", accountStatus: "active" }),
  ];

  it.each<ColorMode>(["role", "tier", "status", "internalExternal"])(
    "is deterministic for %s mode",
    (mode) => {
      const a = buildNodeColors(features, mode);
      const b = buildNodeColors(features, mode);
      expect(Array.from(a)).toEqual(Array.from(b));
    },
  );

  it("gives the same category the same color", () => {
    const buf = buildNodeColors(features, "role");
    // index 0 and 2 are both role "A"
    expect(rgba(buf, 0)).toEqual(rgba(buf, 2));
  });

  it("gives different categories different colors", () => {
    const buf = buildNodeColors(features, "role");
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 1));
  });
});

describe("buildNodeColors internalExternal mode", () => {
  it("colors internal and external users distinctly, consistently", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "internal", isExternal: false }),
    ];
    const buf = buildNodeColors(features, "internalExternal");
    // internals match each other …
    expect(rgba(buf, 0)).toEqual(rgba(buf, 2));
    // … and differ from external
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 1));
  });
});

// ---------------------------------------------------------------------------
// Registry-derived modes (P4.8)
// ---------------------------------------------------------------------------

describe("nodeColors — registry-derived modes", () => {
  it("every categorical/binary registry dim is an available color mode", () => {
    for (const id of ["role", "tier", "internalExternal", "company", "isAdmin"]) {
      expect(COLOR_MODES).toContain(id);
      expect(COLOR_MODE_LABELS[id as (typeof COLOR_MODES)[number]]).toBeTruthy();
    }
  });

  it("dimension-backed modes delegate to descriptor.extract", () => {
    const f = snap({ role: "Engineer" });
    expect(categoryForColor(f, "role")).toBe(String(getDimension("role")!.extract(f)));
  });

  it("the non-dimension 'status' mode still reads accountStatus", () => {
    expect(categoryForColor(snap({ accountStatus: "suspended" }), "status")).toBe("suspended");
  });

  it("legacy 'external' color-mode id migrates to 'internalExternal'", () => {
    expect(migrateColorMode("external")).toBe("internalExternal");
    expect(migrateColorMode("role")).toBe("role");
  });

  it("buildNodeColors yields >1 distinct color for a multi-role dataset (RGBA, alpha=1)", () => {
    const buf = buildNodeColors([snap({ role: "A" }), snap({ role: "B" })], "role");
    expect(buf.length).toBe(8);
    expect(buf[3]).toBe(1);
    expect(buf[7]).toBe(1);
    const c0 = buf.slice(0, 3).join(","),
      c1 = buf.slice(4, 7).join(",");
    expect(c0).not.toBe(c1);
  });
});

// ---------------------------------------------------------------------------
// P6: capability-based color modes + ordered ramp
// ---------------------------------------------------------------------------

describe("nodeColors — P6 capability-based color modes", () => {
  it("COLOR_MODES now contains riskScore, permissionStrength, activityMix (and still role/tier/etc.)", () => {
    for (const id of ["role", "tier", "internalExternal", "isAdmin", "riskScore", "permissionStrength", "activityMix"]) {
      expect(COLOR_MODES).toContain(id);
      expect(COLOR_MODE_LABELS[id as ColorMode]).toBeTruthy();
    }
  });
});

describe("nodeColors — ordered ramp (riskScore)", () => {
  const features = [snap({ riskScore: 0 }), snap({ riskScore: 3 }), snap({ riskScore: 5 })];

  it("is deterministic", () => {
    const a = buildNodeColors(features, "riskScore");
    const b = buildNodeColors(features, "riskScore");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("alpha is 1 and channels are in [0,1] for every node", () => {
    const buf = buildNodeColors(features, "riskScore");
    expect(inUnitRange(buf)).toBe(true);
    for (let i = 0; i < features.length; i++) expect(buf[i * 4 + 3]).toBe(1);
  });

  it("a higher score yields a DIFFERENT color than a lower score (monotonic ramp)", () => {
    const buf = buildNodeColors(features, "riskScore");
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 1));
    expect(rgba(buf, 1)).not.toEqual(rgba(buf, 2));
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 2));
  });
});

describe("nodeColors — activityMix mode colors by dominant category", () => {
  it("same dominant category shares a color; different dominant categories differ", () => {
    const features = [
      snap({ activityMix: { view: 10, edit: 1 } }), // dominant: view
      snap({ activityMix: { upload: 9 } }), // dominant: upload
      snap({ activityMix: { view: 5, upload: 2 } }), // dominant: view
    ];
    const buf = buildNodeColors(features, "activityMix");
    expect(rgba(buf, 0)).toEqual(rgba(buf, 2)); // both dominant view
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 1)); // view vs upload
  });
});

// ---------------------------------------------------------------------------
// buildClusterAssignment
// ---------------------------------------------------------------------------

describe("buildClusterAssignment", () => {
  it("nodes with the same internalExternal category share a cluster id", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),  // category: "internal"
      feature({ affiliation: "external", isExternal: true }),   // category: "external"
      feature({ affiliation: "internal", isExternal: false }),  // category: "internal"
    ];
    const { clusterIds } = buildClusterAssignment(features, "internalExternal");
    // Nodes 0 and 2 are both "internal" → same cluster id
    expect(clusterIds[0]).toBe(clusterIds[2]);
    // Node 1 is "external" → different cluster id
    expect(clusterIds[1]).not.toBe(clusterIds[0]);
  });

  it("distinct categories get distinct cluster ids", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "unknown" as "internal" | "external" | "unknown", isExternal: false }),
    ];
    const { clusterIds } = buildClusterAssignment(features, "internalExternal");
    // All three are distinct → three distinct ids
    const ids = new Set([clusterIds[0], clusterIds[1], clusterIds[2]]);
    expect(ids.size).toBe(3);
  });

  it("labels length equals the number of distinct categories", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "internal", isExternal: false }),
    ];
    const { labels } = buildClusterAssignment(features, "internalExternal");
    // Two distinct categories: "internal" and "external"
    expect(labels.length).toBe(2);
  });

  it("clusterIds.length === features.length", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "internal", isExternal: false }),
    ];
    const { clusterIds } = buildClusterAssignment(features, "internalExternal");
    expect(clusterIds.length).toBe(features.length);
  });

  it("returns Int32Array for clusterIds", () => {
    const features = [feature({ affiliation: "internal", isExternal: false })];
    const { clusterIds } = buildClusterAssignment(features, "internalExternal");
    expect(clusterIds).toBeInstanceOf(Int32Array);
  });

  it("handles an empty feature list", () => {
    const { clusterIds, labels } = buildClusterAssignment([], "internalExternal");
    expect(clusterIds.length).toBe(0);
    expect(labels.length).toBe(0);
  });

  it("works with role mode — nodes sharing the same role share a cluster", () => {
    const features = [
      feature({ role: "Architect" }),
      feature({ role: "Engineer" }),
      feature({ role: "Architect" }),
    ];
    const { clusterIds, labels } = buildClusterAssignment(features, "role");
    expect(clusterIds[0]).toBe(clusterIds[2]);
    expect(clusterIds[1]).not.toBe(clusterIds[0]);
    expect(labels.length).toBe(2);
    expect(labels).toContain("Architect");
    expect(labels).toContain("Engineer");
  });

  it("labels[clusterIds[i]] === categoryForColor(features[i], mode) for all nodes", () => {
    const features = [
      feature({ affiliation: "internal", isExternal: false }),
      feature({ affiliation: "external", isExternal: true }),
      feature({ affiliation: "internal", isExternal: false }),
    ];
    const { clusterIds, labels } = buildClusterAssignment(features, "internalExternal");
    for (let i = 0; i < features.length; i++) {
      const expected = categoryForColor(features[i], "internalExternal");
      expect(labels[clusterIds[i]]).toBe(expected);
    }
  });
});
