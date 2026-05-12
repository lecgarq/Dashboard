/**
 * Unit tests for nodeMatchesFilters — covers all four filter dimensions.
 *
 * Plan 02.5-02 Task 3 (FILT-01 / FILT-02 / FILT-03)
 *
 * Intentionally does NOT test rebuildVisibleIndices cascade — that depends on
 * the full nodes+edges graph and belongs to the plan 04 human-verify.
 */

import { describe, it, expect } from "vitest";
import { nodeMatchesFilters, DEFAULT_FILTERS, type FilterableNode } from "./accGraphFilters";

/** Factory for a minimal FilterableNode — only supply what the test cares about. */
function makeNode(overrides: Partial<FilterableNode> = {}): FilterableNode {
  return {
    roles: [],
    lastAddedBucket: "2026-01",
    isAdmin: false,
    modules: [],
    companyRole: null,
    lastSignIn: null,
    perProjectRoleNames: undefined,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Defaults — every minimal node passes
// ─────────────────────────────────────────────────────────────────────────────

describe("DEFAULT_FILTERS sanity", () => {
  it("passes a node with no fields set", () => {
    expect(nodeMatchesFilters(makeNode(), DEFAULT_FILTERS)).toBe(true);
  });

  it("passes a node with all fields populated", () => {
    const node = makeNode({
      roles: ["Architect"],
      modules: ["docs", "build"],
      companyRole: "Engineer",
      lastSignIn: "2026-03-15T08:00:00Z",
      isAdmin: true,
    });
    expect(nodeMatchesFilters(node, DEFAULT_FILTERS)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Module exclude-list (FILT-03)
// ─────────────────────────────────────────────────────────────────────────────

describe("FILT-03: disabledModules exclude-list", () => {
  it("passes when one module is disabled but another is still on", () => {
    const node = makeNode({ modules: ["A", "B"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, disabledModules: ["A"] })
    ).toBe(true);
  });

  it("excludes when the user's only module is disabled", () => {
    const node = makeNode({ modules: ["A"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, disabledModules: ["A"] })
    ).toBe(false);
  });

  it("excludes when ALL of the user's modules are disabled", () => {
    const node = makeNode({ modules: ["A", "B"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, disabledModules: ["A", "B"] })
    ).toBe(false);
  });

  it("passes when user has no modules regardless of disabledModules", () => {
    const node = makeNode({ modules: [] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, disabledModules: ["A", "B", "C"] })
    ).toBe(true);
  });

  it("passes when disabledModules is empty (default)", () => {
    const node = makeNode({ modules: ["docs", "build"] });
    expect(nodeMatchesFilters(node, DEFAULT_FILTERS)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. companyRole multi-select (DATA-01 filter dimension)
// ─────────────────────────────────────────────────────────────────────────────

describe("DATA-01: companyRoles multi-select", () => {
  it("passes any companyRole when companyRoles filter is empty", () => {
    expect(
      nodeMatchesFilters(makeNode({ companyRole: "Architect" }), DEFAULT_FILTERS)
    ).toBe(true);
  });

  it("passes when companyRole matches an entry in the filter", () => {
    const node = makeNode({ companyRole: "Architect" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, companyRoles: ["Architect"] })
    ).toBe(true);
  });

  it("excludes when companyRole does not match any filter entry", () => {
    const node = makeNode({ companyRole: "Engineer" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, companyRoles: ["Architect"] })
    ).toBe(false);
  });

  it("passes when companyRole is null and 'Unspecified' is in filter", () => {
    const node = makeNode({ companyRole: null });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, companyRoles: ["Unspecified"] })
    ).toBe(true);
  });

  it("excludes when companyRole is null and filter does not include 'Unspecified'", () => {
    const node = makeNode({ companyRole: null });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, companyRoles: ["Architect"] })
    ).toBe(false);
  });

  it("passes when companyRole is in a multi-entry filter", () => {
    const node = makeNode({ companyRole: "Manager" });
    expect(
      nodeMatchesFilters(node, {
        ...DEFAULT_FILTERS,
        companyRoles: ["Architect", "Manager", "Engineer"],
      })
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Date range (FILT-02)
// ─────────────────────────────────────────────────────────────────────────────

describe("FILT-02: dateFrom / dateTo inclusive range", () => {
  it("passes null lastSignIn when no date range is set", () => {
    expect(nodeMatchesFilters(makeNode({ lastSignIn: null }), DEFAULT_FILTERS)).toBe(true);
  });

  it("passes any lastSignIn when no date range is set", () => {
    expect(
      nodeMatchesFilters(
        makeNode({ lastSignIn: "2025-01-01T00:00:00Z" }),
        DEFAULT_FILTERS
      )
    ).toBe(true);
  });

  it("excludes null lastSignIn when dateFrom is active", () => {
    const node = makeNode({ lastSignIn: null });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateFrom: "2026-01-01" })
    ).toBe(false);
  });

  it("excludes null lastSignIn when dateTo is active", () => {
    const node = makeNode({ lastSignIn: null });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateTo: "2026-12-31" })
    ).toBe(false);
  });

  it("passes when lastSignIn is after dateFrom", () => {
    const node = makeNode({ lastSignIn: "2026-02-15T12:00:00Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateFrom: "2026-01-01" })
    ).toBe(true);
  });

  it("excludes when lastSignIn is before dateFrom", () => {
    const node = makeNode({ lastSignIn: "2026-02-15T12:00:00Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateFrom: "2026-03-01" })
    ).toBe(false);
  });

  it("passes when lastSignIn is before dateTo", () => {
    const node = makeNode({ lastSignIn: "2026-02-15T12:00:00Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateTo: "2026-02-28" })
    ).toBe(true);
  });

  it("excludes when lastSignIn is after dateTo", () => {
    const node = makeNode({ lastSignIn: "2026-02-15T12:00:00Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateTo: "2026-02-01" })
    ).toBe(false);
  });

  it("passes on inclusive lower bound (dateFrom exact match)", () => {
    const node = makeNode({ lastSignIn: "2026-02-15T08:30:00Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateFrom: "2026-02-15" })
    ).toBe(true);
  });

  it("passes on inclusive upper bound (dateTo exact match)", () => {
    const node = makeNode({ lastSignIn: "2026-02-28T23:59:59Z" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, dateTo: "2026-02-28" })
    ).toBe(true);
  });

  it("passes when lastSignIn is within a bounded range", () => {
    const node = makeNode({ lastSignIn: "2026-03-10T00:00:00Z" });
    expect(
      nodeMatchesFilters(node, {
        ...DEFAULT_FILTERS,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      })
    ).toBe(true);
  });

  it("excludes when lastSignIn is outside a bounded range (too early)", () => {
    const node = makeNode({ lastSignIn: "2026-02-28T23:59:59Z" });
    expect(
      nodeMatchesFilters(node, {
        ...DEFAULT_FILTERS,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      })
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Combinations
// ─────────────────────────────────────────────────────────────────────────────

describe("Combinations: multi-dimensional filters", () => {
  it("passes a user that satisfies all active dimensions", () => {
    const node = makeNode({
      roles: ["Architect"],
      modules: ["docs", "build"],
      companyRole: "Manager",
      lastSignIn: "2026-03-15T08:00:00Z",
      isAdmin: false,
      lastAddedBucket: "2026-03",
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Architect"],
      disabledModules: ["design"],  // only "design" off — node has docs+build, passes
      companyRoles: ["Manager"],
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      adminAccess: "non-admin" as const,
    };
    expect(nodeMatchesFilters(node, filters)).toBe(true);
  });

  it("excludes a user that fails one dimension among several active", () => {
    const node = makeNode({
      roles: ["Architect"],
      modules: ["docs"],
      companyRole: "Manager",
      lastSignIn: "2026-03-15T08:00:00Z",
      isAdmin: false,
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Architect"],
      disabledModules: ["docs"],  // ALL modules disabled → excluded
      companyRoles: ["Manager"],
      dateFrom: "2026-01-01",
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });

  it("excludes via companyRole even when other dimensions pass", () => {
    const node = makeNode({
      roles: ["Modeler"],
      modules: [],
      companyRole: "Engineer",
      lastSignIn: "2026-04-01T00:00:00Z",
      isAdmin: false,
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Modeler"],
      companyRoles: ["Architect"],  // node has "Engineer" → excluded
      dateFrom: "2026-01-01",
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GRAPH-01: perProjectRoles AND-intersection
// ─────────────────────────────────────────────────────────────────────────────

describe("GRAPH-01: perProjectRoles AND-intersection", () => {
  // Empty filter = no constraint
  it("empty perProjectRoles is a no-op (all nodes pass regardless)", () => {
    const node = makeNode({ perProjectRoleNames: ["Architect", "BIM Manager"] });
    expect(nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: [] })).toBe(true);
  });

  it("empty perProjectRoles passes a node with no per-project roles", () => {
    const node = makeNode({ perProjectRoleNames: undefined });
    expect(nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: [] })).toBe(true);
  });

  // perProjectRoles alone
  it("perProjectRoles alone: passes node that has the selected role", () => {
    const node = makeNode({ perProjectRoleNames: ["Architect"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: ["Architect"] })
    ).toBe(true);
  });

  it("perProjectRoles alone: excludes node that does not have the selected role", () => {
    const node = makeNode({ perProjectRoleNames: ["Engineer"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: ["Architect"] })
    ).toBe(false);
  });

  it("perProjectRoles alone: excludes node with undefined perProjectRoleNames", () => {
    const node = makeNode({ perProjectRoleNames: undefined });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: ["Architect"] })
    ).toBe(false);
  });

  it("perProjectRoles alone: passes when node has at least one matching role (multi-select)", () => {
    const node = makeNode({ perProjectRoleNames: ["Engineer", "BIM Manager"] });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, perProjectRoles: ["Architect", "BIM Manager"] })
    ).toBe(true);
  });

  // perProjectRoles AND status (roles dimension)
  it("perProjectRoles AND roles: passes node satisfying both", () => {
    const node = makeNode({
      roles: ["Manager"],
      perProjectRoleNames: ["Architect"],
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Manager"],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(true);
  });

  it("perProjectRoles AND roles: excludes node failing the roles dimension", () => {
    const node = makeNode({ roles: ["Viewer"], perProjectRoleNames: ["Architect"] });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Manager"],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });

  it("perProjectRoles AND roles: excludes node failing the perProjectRoles dimension", () => {
    const node = makeNode({ roles: ["Manager"], perProjectRoleNames: ["Engineer"] });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Manager"],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });

  // perProjectRoles AND module
  it("perProjectRoles AND module: passes node satisfying both (module not disabled)", () => {
    const node = makeNode({
      modules: ["docs", "build"],
      perProjectRoleNames: ["Architect"],
    });
    const filters = {
      ...DEFAULT_FILTERS,
      disabledModules: ["design"],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(true);
  });

  it("perProjectRoles AND module: excludes node when all modules disabled", () => {
    const node = makeNode({
      modules: ["docs"],
      perProjectRoleNames: ["Architect"],
    });
    const filters = {
      ...DEFAULT_FILTERS,
      disabledModules: ["docs"],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });

  // perProjectRoles AND status AND module (3-way AND)
  it("perProjectRoles AND roles AND module: passes node satisfying all three", () => {
    const node = makeNode({
      roles: ["Manager"],
      modules: ["docs"],
      perProjectRoleNames: ["Architect"],
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Manager"],
      disabledModules: [],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(true);
  });

  it("perProjectRoles AND roles AND module: excludes node failing any single dimension", () => {
    // Fails perProjectRoles (node has "Engineer", filter wants "Architect")
    const node = makeNode({
      roles: ["Manager"],
      modules: ["docs"],
      perProjectRoleNames: ["Engineer"],
    });
    const filters = {
      ...DEFAULT_FILTERS,
      roles: ["Manager"],
      disabledModules: [],
      perProjectRoles: ["Architect"],
    };
    expect(nodeMatchesFilters(node, filters)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Phase 7 filter dimensions (GRAPH7-06, GRAPH7-09, FILT-EXT)
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 7 filter dimensions", () => {
  it("DEFAULT_FILTERS.showFolders === true", () => {
    expect(DEFAULT_FILTERS.showFolders).toBe(true);
  });

  it("DEFAULT_FILTERS.permTiers deep-equals all four permission tiers", () => {
    expect(DEFAULT_FILTERS.permTiers).toEqual(["view", "upload", "edit", "control"]);
  });

  it("DEFAULT_FILTERS.simDims deep-equals all five similarity dimensions", () => {
    expect(DEFAULT_FILTERS.simDims).toEqual([
      "folder-access",
      "roles",
      "projects",
      "company",
      "admin-tier",
    ]);
  });

  it("DEFAULT_FILTERS.simMin === 2", () => {
    expect(DEFAULT_FILTERS.simMin).toBe(2);
  });

  it("DEFAULT_FILTERS.viewMode === 'multi'", () => {
    expect(DEFAULT_FILTERS.viewMode).toBe("multi");
  });

  it("hides folder kind when showFolders=false", () => {
    const node = makeNode({ kind: "folder" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, showFolders: false })
    ).toBe(false);
  });

  it("viewMode='user-only' hides any non-user kind (project)", () => {
    const node = makeNode({ kind: "project" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, viewMode: "user-only" })
    ).toBe(false);
  });

  it("viewMode='user-only' keeps user kind visible", () => {
    const node = makeNode({ kind: "user" });
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, viewMode: "user-only" })
    ).toBe(true);
  });

  it("legacy nodes without kind field are treated as kind='user' (backward compat)", () => {
    // No `kind` property — should be treated as user, so user-only viewMode keeps it visible.
    const node = makeNode();
    expect(
      nodeMatchesFilters(node, { ...DEFAULT_FILTERS, viewMode: "user-only" })
    ).toBe(true);
  });
});
