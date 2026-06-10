import { describe, it, expect } from "vitest";
import { buildTemplateOverview } from "@/lib/server/templateView";
import type { TemplateRosterMember } from "@/lib/acc/template-mty-roster";

const roster: TemplateRosterMember[] = [
  { name: "Cain", email: "cain@hermosillo.com", company: "Hermosillo", role: "Architect", accessLevel: "Project Admin" },
  { name: "Diego", email: "diego@hermosillo.com", company: "Hermosillo", role: "Designer", accessLevel: "Project Member" },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co", role: "Designer", accessLevel: "Project Member" },
];

describe("buildTemplateOverview", () => {
  it("builds members, role/access/company breakdowns, and counts from the roster", () => {
    const o = buildTemplateOverview(roster, "2026-06-09");

    expect(o.memberCount).toBe(3);
    expect(o.updatedAt).toBe("2026-06-09");

    // internal/external + admin derived from email + accessLevel, order preserved
    expect(o.members.map((m) => m.isInternal)).toEqual([true, true, false]);
    expect(o.members.map((m) => m.isAdmin)).toEqual([true, false, false]);
    expect(o.adminCount).toBe(1);

    // roles: Designer 2, Architect 1
    expect(o.distinctRoles).toBe(2);
    expect(o.roleSummary.slices).toEqual([
      { name: "Designer", value: 2 },
      { name: "Architect", value: 1 },
    ]);

    // access-level split, sorted by count desc
    expect(o.accessLevels).toEqual([
      { name: "Project Member", value: 2 },
      { name: "Project Admin", value: 1 },
    ]);

    // companies, sorted by count desc
    expect(o.companies).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: "Outside Co", value: 1 },
    ]);
    expect(o.companyCount).toBe(2);
  });
});
