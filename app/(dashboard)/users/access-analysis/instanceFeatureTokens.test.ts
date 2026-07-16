import { describe, it, expect } from "vitest";
import { instanceFeatureTokens } from "./instanceFeatureTokens";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function fixture(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u1::p1", nameLower: "ann", emailLower: "ann@hermosillo.com",
    project: "Tower A", role: "Project Manager", permTier: "edit", isExternal: false,
    activityBucket: "Med", signinBucket: "<30d", activityCountRaw: 42, lastSignInRel: "3d ago",
    permissionCoverage: "known", firmName: "Hermosillo", accountStatus: "active",
    affiliation: "internal", moduleSignature: ["build", "cost"], activityRecencyBucket: "8-14d",
    permissionStrength: 3, ...over,
  } as NodeFeatureSnapshot;
}

describe("instanceFeatureTokens", () => {
  it("emits role/company/module/permission/activity/affiliation tokens", () => {
    const t = instanceFeatureTokens(fixture());
    expect(t).toContain("role:Project Manager");
    expect(t).toContain("company:Hermosillo");
    expect(t).toContain("mod:build");
    expect(t).toContain("mod:cost");
    expect(t).toContain("perm:edit");
    expect(t).toContain("act:Med");
    expect(t).toContain("aff:internal");
    expect(t).toContain("status:active");
    expect(t).toContain("recency:8-14d");
  });
  it("emits the permission-coverage token (cov: known|partial|unknown)", () => {
    expect(instanceFeatureTokens(fixture())).toContain("cov:known");
    expect(instanceFeatureTokens(fixture({ permissionCoverage: "partial" }))).toContain("cov:partial");
    expect(instanceFeatureTokens(fixture({ permissionCoverage: "unknown" }))).toContain("cov:unknown");
  });
  it("does NOT emit a raw project-identity token (D5: down-weight project)", () => {
    const t = instanceFeatureTokens(fixture());
    expect(t.some((x) => x.startsWith("projid:"))).toBe(false);
  });
  it("is stable/deterministic and deduped", () => {
    const a = instanceFeatureTokens(fixture({ moduleSignature: ["build", "build"] }));
    expect(a.filter((x) => x === "mod:build")).toHaveLength(1);
  });
  it("handles missing optionals without throwing", () => {
    const t = instanceFeatureTokens(fixture({ moduleSignature: undefined, firmName: "", permTier: null, affiliation: undefined }));
    expect(Array.isArray(t)).toBe(true);
    expect(t).toContain("company:(none)");
  });
});
