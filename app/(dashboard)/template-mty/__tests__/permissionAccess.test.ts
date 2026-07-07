import { describe, it, expect } from "vitest";
import { summarizePermissionAccess } from "../permissionAccess";

// rank legend: 1 View only · 2 View/download · 3 +Publish markups · 4 +Upload · 5 +Edit · 6 Full control
describe("summarizePermissionAccess", () => {
  const members = [
    { name: "Cain", role: "Architect" },    // Full control + View only
    { name: "Elisa", role: "Architect" },
    { name: "Diego", role: "Designer" },     // View only + +Upload + +Edit
    { name: "Maria", role: "Contabilidad" }, // no folder perms
  ];
  const rolePermRanks = {
    Architect: [6, 1],
    Designer: [1, 4, 5],
    // Contabilidad intentionally absent
  };

  it("buckets members per tier (rank desc) with role breakdown, and a no-access bucket", () => {
    const s = summarizePermissionAccess(members, rolePermRanks);
    expect(s.memberCount).toBe(4);

    // tiers ordered rank desc; present ranks here: 6,5,4,1
    expect(s.tiers.map((t) => t.rank)).toEqual([6, 5, 4, 1]);

    const full = s.tiers.find((t) => t.rank === 6)!;
    expect(full.label).toBe("Full control");
    expect(full.userCount).toBe(2); // 2 Architects
    expect(full.roles).toEqual([{ role: "Architect", userCount: 2 }]);

    const view = s.tiers.find((t) => t.rank === 1)!;
    expect(view.userCount).toBe(3); // 2 Architects + 1 Designer
    expect(view.roles).toEqual([
      { role: "Architect", userCount: 2 },
      { role: "Designer", userCount: 1 },
    ]);

    // Contabilidad has no perms → no-access bucket
    expect(s.noAccess).toEqual({ userCount: 1, roles: ["Contabilidad"] });
  });

  it("handles empty members", () => {
    expect(summarizePermissionAccess([], {})).toEqual({
      tiers: [],
      noAccess: { userCount: 0, roles: [] },
      memberCount: 0,
    });
  });
});
