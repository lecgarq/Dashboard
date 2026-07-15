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

  it("declares exactly the 9 slider dims + 10 Phase-25 aperture dims", () => {
    expect(Object.keys(byId).sort()).toEqual(
      [
        "user",
        "role",
        "project",
        "company",
        "moduleAccess",
        "folderAccessPermissions",
        "activityVolume",
        "activityByModule",
        "typeOfActivity",
        // Phase 25 aperture (color-only)
        "internalExternal",
        "adminMember",
        "permissionTier",
        "activityRecency",
        "signinRecency",
        "membershipTenure",
        "dominantActivity",
        "riskScore",
        "folderBreadth",
        "accessibleDataTB",
      ].sort(),
    );
  });

  it("extracts Users, Role, Project, Company correctly", () => {
    const f = node({ userName: "Ada Lovelace" });
    expect(byId.user.extract(f)).toBe("Ada Lovelace");
    expect(byId.user.extract(node({ userName: undefined }))).toBeNull();
    expect(byId.role.extract(f)).toBe("Architect");
    expect(byId.project.extract(f)).toBe("Proj A");
    expect(byId.company.extract(f)).toBe("Acme");
  });

  it("extracts moduleAccess correctly", () => {
    expect(byId.moduleAccess.extract(node({ moduleSignature: ["build", "cost"] }))).toEqual(["build"]);
    expect(byId.moduleAccess.extract(node({ moduleSignature: [] }))).toEqual([]);
  });

  it("extracts folderAccessPermissions correctly", () => {
    expect(byId.folderAccessPermissions.extract(node({ permissionStrength: 4 }))).toBe(4);
    expect(byId.folderAccessPermissions.extract(node({ permissionStrength: undefined }))).toBe(0);
  });

  it("extracts activityVolume correctly", () => {
    expect(byId.activityVolume.extract(node({ activityTotal: 42 }))).toBe(42);
    expect(byId.activityVolume.extract(node({ activityTotal: undefined }))).toBe(0);
  });

  it("extracts activityByModule correctly", () => {
    expect(
      byId.activityByModule.extract(
        node({
          actionCounts: {
            "issue-create": 3,
            "rfi-view": 1,
            "unknown-action": 10,
          },
        })
      )
    ).toEqual(["issues", "rfis"]);
  });

  it("extracts typeOfActivity correctly", () => {
    expect(
      byId.typeOfActivity.extract(
        node({
          activityMix: {
            view: 5,
            upload: 0,
            edit: 2,
          },
        })
      )
    ).toEqual(["edit", "view"]);
  });

  it("verifies all dimensions are available and color-surfaced; only the original 9 are sliders", () => {
    const sliderIds = [
      "user", "role", "project", "company", "moduleAccess",
      "folderAccessPermissions", "activityVolume", "activityByModule", "typeOfActivity",
    ];
    for (const d of buildStructuralDimensions()) {
      expect(d.available).toBe(true);
      expect(d.surfaces).toContain("color");
      // Aperture dims must NOT add physics sliders (anti-ripple, Phase 25).
      expect(d.surfaces.includes("slider")).toBe(sliderIds.includes(d.id));
    }
  });

  it("extracts the Phase-25 aperture dims from existing snapshot fields", () => {
    expect(byId.internalExternal.extract(node({ affiliation: "external" }))).toBe("external");
    expect(byId.internalExternal.extract(node({ affiliation: "unknown" }))).toBeNull();
    expect(byId.adminMember.extract(node({ isAdmin: true }))).toBe("Admin");
    expect(byId.adminMember.extract(node({ isAdmin: false }))).toBe("Member");
    expect(byId.adminMember.extract(node({ isAdmin: undefined }))).toBeNull();
    expect(byId.permissionTier.extract(node({ permTier: "edit" }))).toBe("edit");
    expect(byId.permissionTier.extract(node({ permTier: null }))).toBeNull();
    expect(byId.activityRecency.extract(node({ activityRecencyBucket: "0-7d" }))).toBe("0-7d");
    expect(byId.signinRecency.extract(node({ signinBucket: "<7d" }))).toBe("<7d");
    expect(byId.membershipTenure.extract(node({ membershipBucket: "<1y" }))).toBe("<1y");
    expect(byId.membershipTenure.extract(node({ membershipBucket: "unknown" }))).toBeNull();
    expect(byId.dominantActivity.extract(node({ activityMix: { view: 2, edit: 5 } }))).toBe("edit");
    expect(byId.dominantActivity.extract(node({ activityMix: {} }))).toBeNull();
    expect(byId.riskScore.extract(node({ riskScore: 3 }))).toBe(3);
    expect(byId.riskScore.extract(node({ riskScore: undefined }))).toBeNull();
    expect(
      byId.folderBreadth.extract(
        node({ permissionTypeSummary: { folderBreadth: 42, coverage: "known", mixedProfile: false, fullController: false } }),
      ),
    ).toBe(42);
    expect(byId.folderBreadth.extract(node({ permissionTypeSummary: undefined }))).toBeNull();
    expect(byId.accessibleDataTB.extract(node({ accessibleDataBytes: 1024 }))).toBe(1024);
    expect(byId.accessibleDataTB.extract(node({ accessibleDataBytes: undefined }))).toBeNull();
  });
});
