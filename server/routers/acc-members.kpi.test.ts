import { describe, it, expect, vi } from "vitest";
import { accMembersRouter } from "./acc-members";

function makeCaller(db: unknown) {
  return accMembersRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accMembersRouter KPI", () => {
  it("registers getKpiSummary", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("getKpiSummary");
  });

  it("registers enrichedUsers (Phase 5.1 contract unchanged)", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("enrichedUsers");
  });

  it("registers getProductsForUser (Phase 09 LIST-04)", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("getProductsForUser");
  });

  it("uses DC snapshot users/admins/activity when DC users are available", async () => {
    const db = {
      accDcUser: {
        count: vi.fn(async () => 2),
        findMany: vi.fn(async () => [
          { id: "u1", email: "active@example.com", status: "active" },
          { id: "u2", email: "stale@example.com", status: "inactive" },
        ]),
      },
      accDcProjectUserProduct: {
        groupBy: vi.fn(async () => [
          { userId: "u1", _count: { userId: 2 } },
          { userId: "u2", _count: { userId: 1 } },
        ]),
      },
      accMemberCache: {
        count: vi.fn(async () => 99),
      },
      accActivity: {
        count: vi.fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(3),
        groupBy: vi.fn(async () => [{ userEmail: "active@example.com", _count: { _all: 1 } }]),
        findFirst: vi.fn(async () => ({ createdAt: new Date("2026-05-01T00:00:00.000Z") })),
      },
      $queryRawUnsafe: vi.fn()
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 98 }]),
    };

    const result = await makeCaller(db).getKpiSummary({ window: "30d" });

    expect(result).toMatchObject({
      members: { value: 2, delta: 0 },
      accessChanges: { value: 7, delta: 4 },
      activeAdmins: { value: 1, delta: 0 },
      staleMembers: { value: 1, delta: 0 },
      dataEarliestEvent: "2026-05-01T00:00:00.000Z",
    });
    expect(db.accDcProjectUserProduct.groupBy).toHaveBeenCalledWith({
      by: ["userId"],
      where: { accessLevel: "project_admin" },
      _count: { userId: true },
    });
  });
});
