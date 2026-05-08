/**
 * Unit tests for dashboardAnalytics — junk roles, duplicate roles, outlier module
 * combos, computeAllFindings entry point.
 *
 * Plan 04-03 Feature 3 (DASH-03 / DASH-04 / DASH-05 / DASH-09).
 */

import { describe, it, expect } from "vitest";
import type { BulkAccUser, BulkAccProject } from "./acc-types";
import {
  findJunkRoles,
  findDuplicateRoles,
  findOutlierModuleCombos,
  computeAllFindings,
} from "./dashboardAnalytics";

const NOW = new Date("2026-05-08T00:00:00Z");

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeProject(overrides: Partial<BulkAccProject> = {}): BulkAccProject {
  return {
    id: "p1",
    name: "Project 1",
    status: "active",
    isAdmin: false,
    roles: [],
    modules: [],
    ...overrides,
  };
}

function makeUser(overrides: Partial<BulkAccUser> = {}): BulkAccUser {
  return {
    email: "u@example.com",
    name: "User",
    found: true,
    projectCount: 0,
    activeCount: 0,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-05-08T00:00:00Z",
    allRoles: [],
    allModules: [],
    projects: [],
    companyRole: null,
    lastSignIn: null,
    isAccountAdmin: false,
    ...overrides,
  };
}

// ─── findJunkRoles ───────────────────────────────────────────────────────────

describe("findJunkRoles — severity tiering", () => {
  it("flags HIGH when role appears in user.allRoles but never in any project assignment (zeroMembers proxy + zeroModules + vacuously inactive)", () => {
    // "Orphan" role: present in allRoles but not bound to any project.roles → zero
    // project members. Treated as zeroMembers=true per the documented degenerate
    // semantics in dashboardAnalytics.ts.
    const users = [
      makeUser({
        email: "a@x.com",
        allRoles: ["OrphanRole"],
        projects: [makeProject({ roles: [], modules: [] })],
      }),
    ];
    const findings = findJunkRoles(users, NOW);
    const orphan = findings.find((f) => f.role === "OrphanRole");
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe("HIGH");
    expect(orphan!.signals.zeroMembers).toBe(true);
    expect(orphan!.signals.zeroModules).toBe(true);
    expect(orphan!.signals.allInactive90d).toBe(true);
  });

  it("flags MEDIUM when role has members + zero modules across all assignments + all members inactive >90d", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z", // > 90d ago
        allRoles: ["NoModRole"],
        projects: [makeProject({ id: "p1", name: "P1", roles: ["NoModRole"], modules: [] })],
      }),
      makeUser({
        email: "b@x.com",
        lastSignIn: null, // counts as inactive
        allRoles: ["NoModRole"],
        projects: [makeProject({ id: "p2", name: "P2", roles: ["NoModRole"], modules: [] })],
      }),
    ];
    const findings = findJunkRoles(users, NOW);
    const f = findings.find((x) => x.role === "NoModRole");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("MEDIUM");
    expect(f!.signals.zeroMembers).toBe(false);
    expect(f!.signals.zeroModules).toBe(true);
    expect(f!.signals.allInactive90d).toBe(true);
    expect(f!.affectedMembers.sort()).toEqual(["a@x.com", "b@x.com"]);
    expect(f!.affectedProjects.sort()).toEqual(["P1", "P2"]);
  });

  it("flags LOW when role has members, has modules, but all members inactive >90d", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["StaleRole"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["StaleRole"], modules: ["docs"] }),
        ],
      }),
    ];
    const findings = findJunkRoles(users, NOW);
    const f = findings.find((x) => x.role === "StaleRole");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("LOW");
    expect(f!.signals.zeroMembers).toBe(false);
    expect(f!.signals.zeroModules).toBe(false);
    expect(f!.signals.allInactive90d).toBe(true);
  });

  it("does NOT surface a role with active members (lastSignIn within 30d) and modules", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2026-05-01T00:00:00Z", // 7d ago
        allRoles: ["LiveRole"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["LiveRole"], modules: ["docs"] }),
        ],
      }),
    ];
    const findings = findJunkRoles(users, NOW);
    expect(findings.find((f) => f.role === "LiveRole")).toBeUndefined();
  });

  it("populates affectedMembers and affectedProjects from members that hold the role", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["StaleRole"],
        projects: [
          makeProject({ id: "p1", name: "ProjA", roles: ["StaleRole"], modules: ["docs"] }),
          makeProject({ id: "p2", name: "ProjB", roles: ["StaleRole"], modules: ["build"] }),
        ],
      }),
      makeUser({
        email: "b@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["StaleRole"],
        projects: [
          makeProject({ id: "p1", name: "ProjA", roles: ["StaleRole"], modules: ["docs"] }),
        ],
      }),
    ];
    const f = findJunkRoles(users, NOW).find((x) => x.role === "StaleRole");
    expect(f!.affectedMembers.sort()).toEqual(["a@x.com", "b@x.com"]);
    expect(f!.affectedProjects.sort()).toEqual(["ProjA", "ProjB"]);
  });
});

// ─── findDuplicateRoles ──────────────────────────────────────────────────────

describe("findDuplicateRoles", () => {
  it("flags two roles with identical modules and ≥80% name overlap (reordered tokens)", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        allRoles: ["BIM Coordinator"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["BIM Coordinator"], modules: ["docs", "build"] }),
        ],
      }),
      makeUser({
        email: "b@x.com",
        allRoles: ["Coordinator BIM"],
        projects: [
          makeProject({ id: "p2", name: "P2", roles: ["Coordinator BIM"], modules: ["docs", "build"] }),
        ],
      }),
    ];
    const dups = findDuplicateRoles(users);
    expect(dups).toHaveLength(1);
    const d = dups[0];
    const pair = [d.roleA, d.roleB].sort();
    expect(pair).toEqual(["BIM Coordinator", "Coordinator BIM"]);
    expect(d.nameOverlap).toBe(1.0);
    expect(d.moduleOverlap).toBe(1.0);
    expect(d.affectedMembers.sort()).toEqual(["a@x.com", "b@x.com"]);
    expect(d.affectedProjects.sort()).toEqual(["P1", "P2"]);
  });

  it("does NOT flag roles with identical modules but no name overlap", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        allRoles: ["BIM Coordinator"],
        projects: [makeProject({ roles: ["BIM Coordinator"], modules: ["docs"] })],
      }),
      makeUser({
        email: "b@x.com",
        allRoles: ["Architect"],
        projects: [makeProject({ roles: ["Architect"], modules: ["docs"] })],
      }),
    ];
    expect(findDuplicateRoles(users)).toEqual([]);
  });

  it("does NOT flag roles with high name overlap but different modules", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        allRoles: ["BIM Coordinator"],
        projects: [makeProject({ roles: ["BIM Coordinator"], modules: ["docs"] })],
      }),
      makeUser({
        email: "b@x.com",
        allRoles: ["Coordinator BIM"],
        projects: [makeProject({ roles: ["Coordinator BIM"], modules: ["build"] })],
      }),
    ];
    expect(findDuplicateRoles(users)).toEqual([]);
  });

  it("flags each pair once (no symmetric duplicate)", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        allRoles: ["BIM Coordinator"],
        projects: [makeProject({ roles: ["BIM Coordinator"], modules: ["docs"] })],
      }),
      makeUser({
        email: "b@x.com",
        allRoles: ["Coordinator BIM"],
        projects: [makeProject({ roles: ["Coordinator BIM"], modules: ["docs"] })],
      }),
    ];
    const dups = findDuplicateRoles(users);
    expect(dups).toHaveLength(1);
  });
});

// ─── findOutlierModuleCombos ─────────────────────────────────────────────────

describe("findOutlierModuleCombos", () => {
  it("flags module sets held by < threshold of members (default 0.05, exclusive)", () => {
    // 96 users with {A,B}; 4 users with {A,C}. {A,C} = 4/100 = 0.04 < 0.05 → flagged.
    const users: BulkAccUser[] = [];
    for (let i = 0; i < 96; i++) {
      users.push(
        makeUser({
          email: `u${i}@x.com`,
          allModules: ["A", "B"],
          projects: [makeProject({ modules: ["A", "B"] })],
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      users.push(
        makeUser({
          email: `o${i}@x.com`,
          allModules: ["A", "C"],
          projects: [makeProject({ modules: ["A", "C"] })],
        }),
      );
    }
    const out = findOutlierModuleCombos(users);
    expect(out).toHaveLength(1);
    expect(out[0].moduleSet.sort()).toEqual(["A", "C"]);
    expect(out[0].memberCount).toBe(4);
    expect(out[0].totalMembers).toBe(100);
    expect(out[0].pct).toBeCloseTo(0.04, 5);
  });

  it("does NOT flag boundary case where pct == threshold (strict less-than)", () => {
    // 95 with {A,B}; 5 with {A,C}: 5/100 = 0.05 → NOT flagged at default 0.05.
    const users: BulkAccUser[] = [];
    for (let i = 0; i < 95; i++) {
      users.push(
        makeUser({
          email: `u${i}@x.com`,
          allModules: ["A", "B"],
          projects: [makeProject({ modules: ["A", "B"] })],
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      users.push(
        makeUser({
          email: `o${i}@x.com`,
          allModules: ["A", "C"],
          projects: [makeProject({ modules: ["A", "C"] })],
        }),
      );
    }
    expect(findOutlierModuleCombos(users)).toEqual([]);
  });

  it("normalizes moduleSet by sorting + deduping (so {A,B} and {B,A} count together)", () => {
    const users: BulkAccUser[] = [];
    for (let i = 0; i < 50; i++) {
      users.push(makeUser({ email: `u${i}@x.com`, allModules: ["A", "B"] }));
    }
    for (let i = 0; i < 50; i++) {
      users.push(makeUser({ email: `v${i}@x.com`, allModules: ["B", "A"] }));
    }
    // All 100 users have the SAME normalized set {A,B}; nobody is an outlier.
    expect(findOutlierModuleCombos(users)).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(findOutlierModuleCombos([])).toEqual([]);
  });

  it("respects custom thresholdPct argument", () => {
    // 5/100 = 0.05; default threshold rejects (strict <). Raising to 0.06 includes it.
    const users: BulkAccUser[] = [];
    for (let i = 0; i < 95; i++) {
      users.push(makeUser({ email: `u${i}@x.com`, allModules: ["A", "B"] }));
    }
    for (let i = 0; i < 5; i++) {
      users.push(makeUser({ email: `o${i}@x.com`, allModules: ["A", "C"] }));
    }
    const out = findOutlierModuleCombos(users, 0.06);
    expect(out).toHaveLength(1);
    expect(out[0].moduleSet.sort()).toEqual(["A", "C"]);
  });
});

// ─── computeAllFindings ──────────────────────────────────────────────────────

describe("computeAllFindings", () => {
  it("returns all four arrays + roleSeverityIndex Map", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["StaleRole"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["StaleRole"], modules: ["docs"] }),
        ],
        allModules: ["docs"],
      }),
    ];
    const r = computeAllFindings(users, NOW);
    expect(Array.isArray(r.junkRoles)).toBe(true);
    expect(Array.isArray(r.duplicateRoles)).toBe(true);
    expect(Array.isArray(r.outlierCombos)).toBe(true);
    expect(r.roleSeverityIndex).toBeInstanceOf(Map);
  });

  it("roleSeverityIndex maps junk-role to its severity", () => {
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["StaleRole"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["StaleRole"], modules: ["docs"] }),
        ],
      }),
    ];
    const r = computeAllFindings(users, NOW);
    expect(r.roleSeverityIndex.get("StaleRole")).toBe("LOW");
  });

  it("roleSeverityIndex maps duplicate-flagged role to MEDIUM", () => {
    // Both roles are alive (active sign-in) so junk doesn't fire — only duplicate.
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2026-05-01T00:00:00Z",
        allRoles: ["BIM Coordinator"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["BIM Coordinator"], modules: ["docs", "build"] }),
        ],
      }),
      makeUser({
        email: "b@x.com",
        lastSignIn: "2026-05-01T00:00:00Z",
        allRoles: ["Coordinator BIM"],
        projects: [
          makeProject({ id: "p2", name: "P2", roles: ["Coordinator BIM"], modules: ["docs", "build"] }),
        ],
      }),
    ];
    const r = computeAllFindings(users, NOW);
    expect(r.duplicateRoles).toHaveLength(1);
    expect(r.roleSeverityIndex.get("BIM Coordinator")).toBe("MEDIUM");
    expect(r.roleSeverityIndex.get("Coordinator BIM")).toBe("MEDIUM");
  });

  it("roleSeverityIndex picks HIGHEST severity when role is both junk and duplicate (HIGH > MEDIUM > LOW)", () => {
    // Build a role that fires HIGH junk (orphan in allRoles) AND also appears as a
    // duplicate via shared modules + similar name with a sibling. Easier: junk LOW
    // role with duplicate flag → result should still be MEDIUM (max of LOW, MEDIUM).
    const users = [
      makeUser({
        email: "a@x.com",
        lastSignIn: "2025-01-01T00:00:00Z", // inactive >90d → LOW junk
        allRoles: ["BIM Coordinator"],
        projects: [
          makeProject({ id: "p1", name: "P1", roles: ["BIM Coordinator"], modules: ["docs"] }),
        ],
      }),
      makeUser({
        email: "b@x.com",
        lastSignIn: "2025-01-01T00:00:00Z",
        allRoles: ["Coordinator BIM"],
        projects: [
          makeProject({ id: "p2", name: "P2", roles: ["Coordinator BIM"], modules: ["docs"] }),
        ],
      }),
    ];
    const r = computeAllFindings(users, NOW);
    // Both roles are LOW junk (allInactive90d only) + duplicate → MEDIUM wins.
    expect(r.roleSeverityIndex.get("BIM Coordinator")).toBe("MEDIUM");
    expect(r.roleSeverityIndex.get("Coordinator BIM")).toBe("MEDIUM");
  });

  it("now defaults to new Date() when omitted (smoke test — does not throw)", () => {
    expect(() => computeAllFindings([])).not.toThrow();
  });
});
