import { describe, it, expect } from "vitest";
import { roleCounts } from "../roleCounts";
import type { AccessInstance } from "../types";

const mk = (roles: string[]): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles, modules: [], adminModules: [],
});

describe("roleCounts", () => {
  it("returns [] for no rows", () => {
    expect(roleCounts([])).toEqual([]);
  });
  it("counts one assignment per role per instance", () => {
    const out = roleCounts([mk(["Member"]), mk(["Member"]), mk(["Admin"])]);
    expect(out).toEqual([
      { name: "Member", value: 2 },
      { name: "Admin", value: 1 },
    ]);
  });
  it("counts each role of a multi-role instance", () => {
    const out = roleCounts([mk(["Admin", "Member"])]);
    expect(out).toEqual([
      { name: "Admin", value: 1 },
      { name: "Member", value: 1 },
    ]);
  });
  it("sorts descending by count", () => {
    const out = roleCounts([mk(["A"]), mk(["B"]), mk(["B"]), mk(["C"]), mk(["C"]), mk(["C"])]);
    expect(out.map((r) => r.name)).toEqual(["C", "B", "A"]);
  });
  it("skips instances with no roles", () => {
    expect(roleCounts([mk([])])).toEqual([]);
  });
});
