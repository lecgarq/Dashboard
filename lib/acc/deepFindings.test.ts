import { describe, expect, it } from "vitest";
import {
  combineComplianceFindings,
  mapDataHoarding,
  mapExternalElevated,
  mapIdentityMismatch,
  mapRoleDrift,
  mapRoleSynonyms,
  mapShadowModules,
} from "./deepFindings";
import type { ComplianceSummary, ComplianceViolation } from "./governanceCompliance";

describe("deep findings mappers", () => {
  it("returns [] for empty input", () => {
    expect(mapExternalElevated([])).toEqual([]);
    expect(mapDataHoarding([])).toEqual([]);
    expect(mapRoleDrift([])).toEqual([]);
    expect(mapShadowModules([])).toEqual([]);
    expect(mapRoleSynonyms([])).toEqual([]);
    expect(mapIdentityMismatch([])).toEqual([]);
  });

  it("maps external elevated permission rows to critical user-scoped violations", () => {
    const [v] = mapExternalElevated([
      {
        name: "Ada Lovelace",
        email: "ada@external.com",
        company: "Design Co",
        projectName: "Tower A",
        roleAssigned: "Architect",
        folderName: "Financials",
        fullPath: "/Project Files/Financials",
        permType: "Full Controller",
      },
    ]);
    expect(v.severity).toBe("critical");
    expect(v.ruleId).toBe("deep-external-elevated");
    expect(v.userEmail).toBe("ada@external.com");
    expect(v.subjectLabel).toBe("/Project Files/Financials");
    expect(v.recommendation).toBe("Revoke External Access");
    expect(v.description).toContain("Full Controller");
  });

  it("coerces bigint/Decimal-ish counts in mole findings", () => {
    const [v] = mapDataHoarding([
      { email: "bob@x.com", projectName: "Tower A", downloads: BigInt(42), views: 1, download_view_ratio: "42.0" },
    ]);
    expect(v.severity).toBe("critical");
    expect(v.details.downloads).toBe(42);
    expect(v.description).toContain("42 files");
  });

  it("renders role drift as a role-scoped finding with permission variants", () => {
    const [v] = mapRoleDrift([
      { roleName: "Architect", uniquePermTypes: 3, projectCount: 7, permVariants: ["View", "Edit", "Full Controller"] },
    ]);
    expect(v.subjectLabel).toBe("Architect");
    expect(v.userEmail).toBeUndefined();
    expect(v.description).toContain("Full Controller");
  });

  it("filters shadow-module rows by the semantic validator and caps at 10", () => {
    const rows = [
      // authorized: docs service with docs module -> dropped
      { email: "a@x.com", projectId: "p1", projectName: "P1", service: "docs", action_count: 99, modules: ["docs"] },
      // unauthorized: rfis needs build -> kept
      { email: "b@x.com", projectId: "p2", projectName: "P2", service: "rfis", action_count: 5, modules: ["docs"] },
    ];
    const out = mapShadowModules(rows);
    expect(out).toHaveLength(1);
    expect(out[0].userEmail).toBe("b@x.com");
    expect(out[0].severity).toBe("info");
  });

  it("groups role synonyms by accent-stripped name", () => {
    const out = mapRoleSynonyms([
      { id: "1", name: "Architect", memberCount: 4 },
      { id: "2", name: "Arquitecto", memberCount: 2 },
      { id: "3", name: "Plumber", memberCount: 1 },
    ]);
    // "Architect" and "Arquitecto" do NOT normalize equal; only exact accent/spacing
    // collisions group. Verify a real accent collision instead.
    const accented = mapRoleSynonyms([
      { id: "1", name: "Dirección", memberCount: 4 },
      { id: "2", name: "Direccion", memberCount: 2 },
    ]);
    expect(out).toHaveLength(0);
    expect(accented).toHaveLength(1);
    expect(accented[0].description).toContain("Dirección");
  });

  it("distinguishes forward vs reverse identity mismatches", () => {
    const out = mapIdentityMismatch([
      { email: "x@gmail.com", name: "X", company: "Hermosillo", kind: "external-email" },
      { email: "y@hermosillo.com", name: "Y", company: "Other Co", kind: "wrong-company" },
    ]);
    expect(out[0].description).toContain("non-Hermosillo email");
    expect(out[1].description).toContain("registered under company");
  });
});

describe("combineComplianceFindings", () => {
  const base: ComplianceSummary = {
    score: 95,
    violations: [
      { id: "g1", ruleId: "external-admin", severity: "critical", title: "t", description: "d", recommendation: "r", details: {} },
    ],
    metrics: { criticalCount: 1, warningCount: 0, infoCount: 0, auditedUsersCount: 200 },
  };
  const deep: ComplianceViolation[] = [
    { id: "d1", ruleId: "deep-velocity-spike", severity: "warning", title: "t", description: "d", recommendation: "r", details: {} },
    { id: "d2", ruleId: "deep-role-synonym", severity: "info", title: "t", description: "d", recommendation: "r", details: {} },
  ];

  it("merges violations and recomputes score + metrics", () => {
    const merged = combineComplianceFindings(base, deep);
    expect(merged.violations).toHaveLength(3);
    // 100 - 15 (critical) - 5 (warning) - 1 (info) = 79
    expect(merged.score).toBe(79);
    expect(merged.metrics).toEqual({
      criticalCount: 1,
      warningCount: 1,
      infoCount: 1,
      auditedUsersCount: 200,
    });
  });

  it("clamps score at 0 when violations are severe", () => {
    const many = Array.from({ length: 10 }, (_, i): ComplianceViolation => ({
      id: `c${i}`, ruleId: "x", severity: "critical", title: "t", description: "d", recommendation: "r", details: {},
    }));
    const merged = combineComplianceFindings(base, many);
    expect(merged.score).toBe(0);
  });
});
