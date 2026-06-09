import { describe, it, expect } from "vitest";
import { buildTemplateOverview, type TemplateMemberRow } from "@/lib/server/templateView";

const rows: TemplateMemberRow[] = [
  { name: "Alberto", email: "alberto.sanchez@hermosillo.com", companyName: "Hermosillo",
    products: { docs: "member", build: "administrator" }, projectAdmin: false, roleNames: ["Core"] },
  { name: "Luis", email: "luis.cortes@hermosillo.com", companyName: "Hermosillo",
    products: { docs: "member" }, projectAdmin: true, roleNames: ["VDC Innovacion"] },
  { name: "Guest", email: "guest@outside.com", companyName: "Outside Co",
    products: {}, projectAdmin: false, roleNames: [] },
];

describe("buildTemplateOverview", () => {
  it("assembles members, role/module summaries, company counts, and counts", () => {
    const o = buildTemplateOverview(rows, "2026-06-09T00:00:00.000Z");

    expect(o.memberCount).toBe(3);
    expect(o.syncedAt).toBe("2026-06-09T00:00:00.000Z");

    expect(o.members.map((m) => m.isInternal)).toEqual([true, true, false]);
    expect(o.members.map((m) => m.isAdmin)).toEqual([false, true, false]);

    expect(o.distinctRoles).toBe(2);
    expect(o.roleSummary.total).toBe(3);

    expect(o.companies).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: "Outside Co", value: 1 },
    ]);
    expect(o.companyCount).toBe(2);

    expect(o.moduleSummary.memberCount).toBe(3);
    expect(o.moduleSummary.slices.find((s) => s.id === "dataManagement")?.value).toBe(2);
  });
});
