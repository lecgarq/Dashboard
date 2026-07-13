import { describe, it, expect } from "vitest";
import { assemblePermissionUserCounts } from "./permissionUserView";

describe("assemblePermissionUserCounts", () => {
  it("maps ranks to labels ordered strongest -> weakest and sums usersWithGrants", () => {
    const counts = assemblePermissionUserCounts(
      [
        { strongest: 3, users: 231 },
        { strongest: 6, users: 471 },
        { strongest: 5, users: 1279 },
        { strongest: 1, users: 3 },
      ],
      2524,
      3791,
    );
    expect(counts.tiers).toEqual([
      { permType: "Full Controller", users: 471 },
      { permType: "View+Download+Upload+Edit", users: 1279 },
      { permType: "View+Download", users: 231 },
      { permType: "View Only", users: 3 },
    ]);
    expect(counts.usersWithGrants).toBe(471 + 1279 + 231 + 3);
    expect(counts.usersWithRoles).toBe(2524);
    expect(counts.totalDcUsers).toBe(3791);
  });

  it("labels rank 0 as Unrecognized (out-of-vocabulary permTypes are kept, never dropped)", () => {
    const counts = assemblePermissionUserCounts([{ strongest: 0, users: 7 }], 10, 20);
    expect(counts.tiers).toEqual([{ permType: "Unrecognized", users: 7 }]);
    expect(counts.usersWithGrants).toBe(7);
  });

  it("returns empty tiers and zero totals for no rows", () => {
    const counts = assemblePermissionUserCounts([], 0, 0);
    expect(counts.tiers).toEqual([]);
    expect(counts.usersWithGrants).toBe(0);
  });
});
