import { describe, it, expect } from "vitest";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "n", emailLower: "e", project: "Proj A", role: "Architect",
    permTier: "edit", isExternal: false, affiliation: "internal",
    activityBucket: "Low", signinBucket: "<30d", activityCountRaw: 1, lastSignInRel: "1d ago",
    permissionCoverage: "known", firmName: "Acme", accountStatus: "active", isAdmin: true,
    moduleSignature: ["build", "cost"], permissionStrength: 4, membershipAgeDays: 100,
    membershipBucket: "<1y", ...over,
  } as NodeFeatureSnapshot;
}

describe("buildStructuralDimensions", () => {
  const byId = Object.fromEntries(buildStructuralDimensions().map((d) => [d.id, d]));

  it("declares the 9 excel structural/access dims", () => {
    expect(Object.keys(byId).sort()).toEqual(
      ["admin", "company", "internalExternal", "moduleAccess", "permission", "project", "role", "status", "tenure"],
    );
  });
  it("extracts categorical structure values", () => {
    const f = node();
    expect(byId.project.extract(f)).toBe("Proj A");
    expect(byId.role.extract(f)).toBe("Architect");
    expect(byId.company.extract(f)).toBe("Acme");
    expect(byId.status.extract(f)).toBe("active");
    expect(byId.internalExternal.extract(f)).toBe("internal");
  });
  it("admin is binary admin/member", () => {
    expect(byId.admin.extract(node({ isAdmin: true }))).toBe("admin");
    expect(byId.admin.extract(node({ isAdmin: false }))).toBe("member");
  });
  it("permission is an ordinal 0..5 strength", () => {
    expect(byId.permission.kind).toBe("ordinal");
    expect(byId.permission.extract(node({ permissionStrength: 4 }))).toBe(4);
    expect(byId.permission.extract(node({ permissionStrength: undefined }))).toBe(0);
  });
  it("moduleAccess maps productKeys to excel module ids (cost folds into build), multiHot", () => {
    expect(byId.moduleAccess.kind).toBe("multiHot");
    expect(byId.moduleAccess.extract(node({ moduleSignature: ["build", "cost", "modelCoordination"] }))).toEqual(
      ["build", "modelCoordination"],
    );
    expect(byId.moduleAccess.extract(node({ moduleSignature: [] }))).toEqual([]);
  });
  it("tenure is ordinal membership age in days (null when unknown)", () => {
    expect(byId.tenure.kind).toBe("ordinal");
    expect(byId.tenure.extract(node({ membershipAgeDays: 100 }))).toBe(100);
    expect(byId.tenure.extract(node({ membershipAgeDays: null }))).toBeNull();
  });
  it("all structural dims are available and slider+color surfaced", () => {
    for (const d of buildStructuralDimensions()) {
      expect(d.available).toBe(true);
      expect(d.surfaces).toContain("slider");
    }
  });
});
