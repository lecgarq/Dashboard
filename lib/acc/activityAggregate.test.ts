import { describe, it, expect } from "vitest";
import { foldActivityRows } from "./activityAggregate";

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

  it("never emits raw actions — only categorized counts (no payload leak)", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "Some Obscure Action", count: 1, lastCreatedAt: "2026-05-01T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(Object.keys(inst).sort()).toEqual(["lastActivity", "mix", "total"]);
    for (const k of Object.keys(inst.mix)) {
      expect(["view","upload","edit","delete","memberEvent","projectEvent","other"]).toContain(k);
    }
  });
});
