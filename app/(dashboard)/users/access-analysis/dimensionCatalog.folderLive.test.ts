import { describe, it, expect } from "vitest";
import { buildFolderReachDimensions } from "./dimensionCatalog.folderLive";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "n", emailLower: "e", project: "P", role: "R",
    permTier: null, isExternal: false, affiliation: "internal",
    activityBucket: "None", signinBucket: ">90d", activityCountRaw: 0, lastSignInRel: "Never",
    permissionCoverage: "known", firmName: "", accountStatus: "active",
    permissionTypeSummary: { folderBreadth: 12, coverage: "known", mixedProfile: true, fullController: true },
    ...over,
  } as NodeFeatureSnapshot;
}

describe("buildFolderReachDimensions", () => {
  const byId = Object.fromEntries(buildFolderReachDimensions().map((d) => [d.id, d]));

  it("declares 3 live folder dims, all available + slider-surfaced", () => {
    expect(Object.keys(byId).sort()).toEqual(["folder:controller", "folder:mixed", "folder:reach"]);
    for (const d of buildFolderReachDimensions()) {
      expect(d.family).toBe("folder");
      expect(d.available).toBe(true);
      expect(d.surfaces).toContain("slider");
    }
  });
  it("folder:reach extracts folderBreadth (0 when missing)", () => {
    expect(byId["folder:reach"].extract(node({ permissionTypeSummary: { folderBreadth: 12, coverage: "known", mixedProfile: false, fullController: false } }))).toBe(12);
    expect(byId["folder:reach"].extract(node({ permissionTypeSummary: undefined }))).toBe(0);
  });
  it("folder:controller and folder:mixed are binary", () => {
    expect(byId["folder:controller"].extract(node())).toBe("controller");
    expect(byId["folder:controller"].extract(node({ permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false } }))).toBe("limited");
    expect(byId["folder:mixed"].extract(node())).toBe("mixed");
    expect(byId["folder:mixed"].extract(node({ permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false } }))).toBe("uniform");
  });
});
