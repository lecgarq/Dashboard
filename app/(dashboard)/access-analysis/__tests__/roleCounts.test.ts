import { describe, it, expect } from "vitest";
import { summarizeRoles, collapseToTopSlices, UNKNOWN_ROLE, MULTIPLE_ROLES, REMOVED_MEMBER } from "../roleCounts";
import type { AccessInstance } from "../types";

const mk = (roles: string[]): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles, modules: [], adminModules: [],
});

describe("summarizeRoles", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeRoles([])).toEqual({ slices: [], distinctRoles: 0, total: 0, usersByRole: new Map() });
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

  it("routes deleted memberships into the Removed-member bucket, not Unknown", () => {
    const s = summarizeRoles([
      { ...mk([]), status: "deleted" },        // deleted, role-less (the 100% real-DB case)
      { ...mk(["Member"]), status: "deleted" }, // deleted wins even if roles somehow survive
      mk([]),                                   // active + role-less -> Unknown
      mk(["Member"]),
    ]);
    expect(s.total).toBe(4);
    expect(s.slices).toEqual(
      expect.arrayContaining([
        { name: REMOVED_MEMBER, value: 2 },
        { name: UNKNOWN_ROLE, value: 1 },
        { name: "Member", value: 1 },
      ]),
    );
    // Lossless: still one bucket per membership.
    expect(s.slices.reduce((n, x) => n + x.value, 0)).toBe(4);
  });

  it("treats missing status as active (back-compat for rows without the field)", () => {
    const s = summarizeRoles([{ roles: [] }]);
    expect(s.slices).toEqual([{ name: UNKNOWN_ROLE, value: 1 }]);
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

  it("collects the people behind each role bucket (seat count per person)", () => {
    const s = summarizeRoles([
      { roles: ["Member"], name: "Ana", email: "ana@x.com" },
      { roles: ["Member"], name: "Ana", email: "ana@x.com" }, // same person, 2nd seat
      { roles: ["Member"], name: "Bo", email: "bo@x.com" },
      { roles: ["Admin", "Member"], name: "Cy", email: "cy@x.com" }, // -> Multiple roles
      { roles: [], name: "Di", email: "di@x.com" }, // -> Unknown
    ]);
    expect(s.usersByRole.get("Member")).toEqual([
      { email: "ana@x.com", name: "Ana", count: 2 },
      { email: "bo@x.com", name: "Bo", count: 1 },
    ]);
    expect(s.usersByRole.get("Multiple roles")).toEqual([{ email: "cy@x.com", name: "Cy", count: 1 }]);
    expect(s.usersByRole.get("Unknown")).toEqual([{ email: "di@x.com", name: "Di", count: 1 }]);
    // Seat counts sum to the slice value.
    const memberSeats = s.usersByRole.get("Member")!.reduce((n, p) => n + p.count, 0);
    expect(memberSeats).toBe(s.slices.find((x) => x.name === "Member")!.value);
  });

  it("leaves the people list empty when rows carry no email (back-compat)", () => {
    const s = summarizeRoles([{ roles: ["Member"] }, { roles: ["Member"] }]);
    expect(s.slices).toEqual([{ name: "Member", value: 2 }]);
    expect(s.usersByRole.size).toBe(0);
  });

  it("falls back to the email as the display name when name is absent", () => {
    const s = summarizeRoles([{ roles: ["Member"], email: "noname@x.com" }]);
    expect(s.usersByRole.get("Member")).toEqual([{ email: "noname@x.com", name: "noname@x.com", count: 1 }]);
  });
});

describe("collapseToTopSlices", () => {
  const slices = [
    { name: UNKNOWN_ROLE, value: 100 },
    { name: MULTIPLE_ROLES, value: 50 },
    { name: "A", value: 30 },
    { name: "B", value: 20 },
    { name: "C", value: 10 },
    { name: "D", value: 5 },
    { name: "E", value: 1 },
  ];

  it("pins Unknown + Multiple roles, keeps the top N roles, folds the rest into Others", () => {
    expect(collapseToTopSlices(slices, 2)).toEqual([
      { name: UNKNOWN_ROLE, value: 100 },
      { name: MULTIPLE_ROLES, value: 50 },
      { name: "A", value: 30 },
      { name: "B", value: 20 },
      { name: "Others (3 roles)", value: 16 }, // C+D+E
    ]);
  });

  it("never folds the warning buckets, even at top 1", () => {
    const out = collapseToTopSlices(slices, 1);
    // Kept: A (30). Others = B+C+D+E = 36, which outranks A by count.
    expect(out.map((s) => s.name)).toEqual([UNKNOWN_ROLE, MULTIPLE_ROLES, "Others (4 roles)", "A"]);
    expect(out.find((s) => s.name === "A")).toEqual({ name: "A", value: 30 });
  });

  it("pins Removed member alongside the warning buckets", () => {
    const out = collapseToTopSlices([{ name: REMOVED_MEMBER, value: 40 }, ...slices], 1);
    expect(out.map((s) => s.name)).toContain(REMOVED_MEMBER);
    expect(out.some((s) => s.name.startsWith("Others"))).toBe(true);
  });

  it("adds no Others slice when topN covers every role", () => {
    const out = collapseToTopSlices(slices, 10);
    expect(out.some((s) => s.name.startsWith("Others"))).toBe(false);
    expect(out).toHaveLength(slices.length);
  });

  it("uses singular wording for a single leftover role", () => {
    expect(collapseToTopSlices(slices, 4).find((s) => s.name.startsWith("Others"))).toEqual({
      name: "Others (1 role)",
      value: 1,
    });
  });
});
