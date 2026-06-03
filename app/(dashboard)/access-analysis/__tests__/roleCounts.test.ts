import { describe, it, expect } from "vitest";
import { summarizeRoles, UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { AccessInstance } from "../types";

const mk = (roles: string[]): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles, modules: [], adminModules: [],
});

describe("summarizeRoles", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeRoles([])).toEqual({ slices: [], distinctRoles: 0, total: 0 });
  });

  it("buckets single role, multi-role, and role-less memberships", () => {
    const s = summarizeRoles([
      mk(["Member"]), mk(["Member"]),
      mk(["Admin", "Member"]),   // -> Multiple roles
      mk([]),                     // -> Unknown
    ]);
    expect(s.total).toBe(4);
    expect(s.slices).toEqual([
      { name: "Member", value: 2 },
      { name: MULTIPLE_ROLES, value: 1 },
      { name: UNKNOWN_ROLE, value: 1 },
    ]);
  });

  it("counts distinct role names across all memberships, including inside multi-role", () => {
    const s = summarizeRoles([mk(["Admin", "Member"]), mk(["Member"]), mk(["Designer"]), mk([])]);
    // Admin, Member, Designer -> 3 distinct; Unknown is not a role.
    expect(s.distinctRoles).toBe(3);
  });

  it("de-duplicates repeated roles within one membership (still counts as single)", () => {
    const s = summarizeRoles([mk(["Admin", "Admin"])]);
    expect(s.slices).toEqual([{ name: "Admin", value: 1 }]);
    expect(s.distinctRoles).toBe(1);
  });
});
