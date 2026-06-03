import { describe, it, expect } from "vitest";
import { roleBuckets, UNKNOWN_ROLE } from "../roleCounts";
import type { AccessInstance } from "../types";

const mk = (roles: string[]): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles, modules: [], adminModules: [],
});

describe("roleBuckets", () => {
  it("returns [] for no rows", () => {
    expect(roleBuckets([])).toEqual([]);
  });

  it("buckets a single-role membership under that role", () => {
    expect(roleBuckets([mk(["Member"]), mk(["Member"]), mk(["Admin"])])).toEqual([
      { name: "Member", value: 2 },
      { name: "Admin", value: 1 },
    ]);
  });

  it("buckets a multi-role membership under one combined, alphabetised slice", () => {
    const out = roleBuckets([mk(["Member", "Admin"])]);
    expect(out).toEqual([{ name: "Admin + Member", value: 1 }]);
  });

  it("treats role order as irrelevant for the combined label", () => {
    const out = roleBuckets([mk(["Member", "Admin"]), mk(["Admin", "Member"])]);
    expect(out).toEqual([{ name: "Admin + Member", value: 2 }]);
  });

  it("de-duplicates repeated roles within one membership", () => {
    expect(roleBuckets([mk(["Admin", "Admin"])])).toEqual([{ name: "Admin", value: 1 }]);
  });

  it("buckets role-less memberships under Unknown", () => {
    const out = roleBuckets([mk([]), mk([]), mk(["Member"])]);
    expect(out).toEqual([
      { name: UNKNOWN_ROLE, value: 2 },
      { name: "Member", value: 1 },
    ]);
  });

  it("sorts descending by count, then by name for stable ties", () => {
    const out = roleBuckets([mk(["B"]), mk(["A"]), mk(["A"]), mk(["C"]), mk(["C"])]);
    expect(out).toEqual([
      { name: "A", value: 2 },
      { name: "C", value: 2 },
      { name: "B", value: 1 },
    ]);
  });
});
