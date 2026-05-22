import { describe, it, expect } from "vitest";
import {
  COLOR_MODES,
  COLOR_MODE_LABELS,
  categoryForColor,
  buildNodeColors,
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
  it("leads with role (the default mode)", () => {
    expect(COLOR_MODES[0]).toBe("role");
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
