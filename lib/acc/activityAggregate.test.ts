import { describe, it, expect } from "vitest";
import { foldActivityRows, foldAdminActionRows } from "./activityAggregate";

describe("foldActivityRows", () => {
  it("buckets raw actions by normalized category per (email, projectId)", () => {
    const out = foldActivityRows([
      { userEmail: "A@x.com", projectId: "p1", rawAction: "File Viewed", count: 3, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "File Uploaded", count: 2, lastCreatedAt: "2026-05-10T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!; // key lowercased
    expect(inst.mix.view).toBe(3);
    expect(inst.mix.upload).toBe(2);
    expect(inst.total).toBe(5);
    expect(inst.lastActivity).toBe("2026-05-10T00:00:00.000Z"); // max
  });

  it("keeps a per-canonical-action count map (resolved + summed) alongside the category mix", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 4, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 1, lastCreatedAt: "2026-05-02T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "issue-create", count: 2, lastCreatedAt: "2026-05-03T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "add-attribute-to-namingstandard", count: 1, lastCreatedAt: "2026-05-04T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(inst.actionCounts!["view-entity"]).toBe(5);
    expect(inst.actionCounts!["issue-create"]).toBe(2);
    expect(inst.actionCounts!["add-attribute-to-naming-standard"]).toBe(1);
  });

  it("emits only category mix + canonical action ids — never raw payload strings", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 1, lastCreatedAt: "2026-05-01T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(Object.keys(inst).sort()).toEqual(["actionCounts", "lastActivity", "mix", "total"]);
    for (const k of Object.keys(inst.mix)) {
      expect(["view","upload","edit","delete","memberEvent","projectEvent","other"]).toContain(k);
    }
    for (const k of Object.keys(inst.actionCounts!)) expect(k).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("foldAdminActionRows", () => {
  it("sums admin actions per actor (lowercased), keyed by canonical action id", () => {
    const out = foldAdminActionRows([
      { actorEmail: "Boss@x.com", rawAction: "assign-member", count: 3 },
      { actorEmail: "boss@x.com", rawAction: "assign-member", count: 2 },
      { actorEmail: "boss@x.com", rawAction: "edit-project", count: 1 },
    ]);
    expect(out.get("boss@x.com")).toEqual({ "assign-member": 5, "edit-project": 1 });
  });
});
