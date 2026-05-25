import { describe, it, expect } from "vitest";
import { computeRiskFlags, type RiskInput } from "../riskFlags";

const base: RiskInput = {
  isExternal: false,
  isAdmin: false,
  signinBucket: "<7d",
  accountStatus: "active",
  hasAccess: true,
  permissionStrength: 0,
  folderBreadth: 0,
  activityTotal: 0,
};

describe("computeRiskFlags — Phase A (no perm/activity)", () => {
  it("externalProjectAdmin: external AND admin", () => {
    expect(computeRiskFlags({ ...base, isExternal: true, isAdmin: true }).externalProjectAdmin).toBe(true);
    expect(computeRiskFlags({ ...base, isExternal: false, isAdmin: true }).externalProjectAdmin).toBe(false);
  });

  it("staleButActive: cold sign-in AND active account AND has access", () => {
    expect(computeRiskFlags({ ...base, signinBucket: ">90d" }).staleButActive).toBe(true);
    expect(computeRiskFlags({ ...base, signinBucket: ">90d", hasAccess: false }).staleButActive).toBe(false);
    expect(computeRiskFlags({ ...base, signinBucket: ">90d", accountStatus: "inactive" }).staleButActive).toBe(false);
  });

  it("permission/activity flags are false when those inputs are zero", () => {
    const f = computeRiskFlags({ ...base, isExternal: true });
    expect(f.externalHighPerm).toBe(false);
    expect(f.broadFolderAccess).toBe(false);
    expect(f.highActivityHighPerm).toBe(false);
  });
});
