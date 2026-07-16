import { describe, expect, it } from "vitest";
import { resolveWhyKey, WHY_COVERAGE_DIM_IDS } from "./whySimilar";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "ana lima",
    emailLower: "ana@hermosillo.com",
    project: "Proj X",
    role: "Architect",
    permTier: "edit",
    isExternal: false,
    activityBucket: "High",
    signinBucket: "<7d",
    activityCountRaw: 42,
    lastSignInRel: "3d ago",
    permissionCoverage: "known",
    firmName: "ACME",
    accountStatus: "active",
    activityTotal: 120,
    permissionStrength: 4,
    riskScore: 2,
    membershipAgeDays: 200,
    accessibleDataBytes: 2 * 1024 ** 3,
    permissionTypeSummary: {
      folderBreadth: 15,
      coverage: "known",
      mixedProfile: false,
      fullController: false,
    },
    ...over,
  } as NodeFeatureSnapshot;
}

describe("resolveWhyKey", () => {
  const a = snap();
  const b = snap({ nodeId: "v::q", activityTotal: 100, membershipAgeDays: 180 });

  it("resolves token keys with embedded values", () => {
    expect(resolveWhyKey("role:Architect", a, b)).toEqual({ label: "Same role: Architect" });
    expect(resolveWhyKey("company:ACME", a, b)).toEqual({
      label: "Same company: ACME",
      coverageDimId: "company",
    });
    expect(resolveWhyKey("perm:edit", a, b)).toEqual({
      label: "Same permission tier: edit",
      coverageDimId: "permissionTier",
    });
    expect(resolveWhyKey("permstr:4", a, b)).toEqual({
      label: "Same permission strength (4/5)",
      coverageDimId: "folderAccessPermissions",
    });
    expect(resolveWhyKey("act:High", a, b)).toEqual({
      label: "Similar activity: High",
      coverageDimId: "activityVolume",
    });
    expect(resolveWhyKey("recency:0-7d", a, b)).toEqual({
      label: "Same activity recency: 0-7d",
      coverageDimId: "activityRecency",
    });
    expect(resolveWhyKey("aff:internal", a, b)).toEqual({ label: "Both internal" });
    expect(resolveWhyKey("status:active", a, b)).toEqual({ label: "Same status: active" });
    expect(resolveWhyKey("admin:1", a, b)).toEqual({ label: "Both project admins" });
    expect(resolveWhyKey("mod:build", a, b)?.label).toMatch(/^Shared module: /);
  });

  it("renders live values for numeric-column keys", () => {
    expect(resolveWhyKey("activityTotal", a, b)).toEqual({
      label: "Similar activity volume: 120/100",
      coverageDimId: "activityVolume",
    });
    expect(resolveWhyKey("folderBreadth", a, b)?.label).toBe(
      "Similar folder breadth: 15/15 folders",
    );
    expect(resolveWhyKey("accessibleDataBytes", a, b)?.label).toBe(
      "Similar data reach: 2.0 GB/2.0 GB",
    );
    expect(resolveWhyKey("membershipAgeDays", a, b)?.label).toBe(
      "Similar tenure: 200/180 days",
    );
    expect(resolveWhyKey("permissionStrength", a, b)?.label).toBe(
      "Similar permission strength: 4/4",
    );
    expect(resolveWhyKey("riskScore", a, b)).toEqual({ label: "Similar risk score: 2/2" });
    // missing match snapshot -> zeros, never a crash
    expect(resolveWhyKey("activityTotal", a, undefined)?.label).toBe(
      "Similar activity volume: 120/0",
    );
  });

  it("never presents shared placeholders as explanations", () => {
    for (const key of ["company:(none)", "role:(no role)", "recency:none", "aff:unknown", "status:", "perm:(none)"]) {
      expect(resolveWhyKey(key, a, b)).toBeNull();
    }
    // real values unaffected
    expect(resolveWhyKey("company:ACME", a, b)).not.toBeNull();
    expect(resolveWhyKey("admin:1", a, b)).not.toBeNull();
  });

  it("returns null for meta / non-signal / unknown keys", () => {
    expect(resolveWhyKey("cov:known", a, b)).toBeNull();
    expect(resolveWhyKey("membershipAgeDays_missing", a, b)).toBeNull();
    expect(resolveWhyKey("permissionStrength_missing", a, b)).toBeNull();
    expect(resolveWhyKey("admin:0", a, b)).toBeNull();
    expect(resolveWhyKey("someFutureKey", a, b)).toBeNull();
  });

  it("suppresses permission-derived keys when either endpoint coverage is unknown", () => {
    const unknown = snap({ permissionCoverage: "unknown" });
    for (const key of ["perm:edit", "permstr:4", "permissionStrength", "folderBreadth", "accessibleDataBytes"]) {
      expect(resolveWhyKey(key, unknown, b)).toBeNull();
      expect(resolveWhyKey(key, a, unknown)).toBeNull();
    }
    // non-permission keys unaffected
    expect(resolveWhyKey("company:ACME", unknown, b)).not.toBeNull();
    expect(resolveWhyKey("activityTotal", unknown, b)).not.toBeNull();
  });

  it("exports every referenced coverage dim id", () => {
    const keys = [
      "company:X", "perm:X", "permstr:1", "act:X", "recency:X",
      "activityTotal", "folderBreadth", "accessibleDataBytes",
      "membershipAgeDays", "permissionStrength",
    ];
    for (const key of keys) {
      const chip = resolveWhyKey(key, a, b);
      if (chip?.coverageDimId) {
        expect(WHY_COVERAGE_DIM_IDS).toContain(chip.coverageDimId);
      }
    }
  });
});
