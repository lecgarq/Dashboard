import { describe, it, expect } from "vitest";
import { buildSummary } from "../aggregations";
import type { AccessInstance } from "../types";

const mk = (o: Partial<AccessInstance>): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles: ["Member"], modules: [], adminModules: [], ...o,
});

const rows: AccessInstance[] = [
  mk({ userId: "u1", projectId: "p1", isInternal: true, isAdmin: true, modules: ["build"], adminModules: ["build"], company: "Hermosillo", roles: ["Admin"] }),
  mk({ userId: "u2", projectId: "p1", email: "b@acme.com", isInternal: false, isAdmin: false, status: "pending", modules: ["build", "insight"], company: "Acme", roles: ["Member"] }),
  mk({ userId: "u3", projectId: "p2", email: "c@acme.com", isInternal: false, isAdmin: true, modules: ["insight"], adminModules: ["insight"], company: "Acme", roles: ["Member"] }),
];

describe("buildSummary", () => {
  const s = buildSummary(rows);
  it("counts distinct users/projects/companies and total access + roles", () => {
    expect(s.counts.access).toBe(3);
    expect(s.counts.users).toBe(3);
    expect(s.counts.projects).toBe(2);
    expect(s.counts.companies).toBe(2);
    expect(s.counts.roles).toBe(2); // Admin, Member
  });
  it("computes composition", () => {
    expect(s.composition.internalExternal).toEqual({ internal: 1, external: 2 });
    expect(s.composition.permission).toEqual({ admin: 2, member: 1 });
  });
  it("computes module admin/member split sorted by total desc", () => {
    const build = s.modules.find((m) => m.id === "build")!;
    expect(build).toMatchObject({ admin: 1, member: 1, total: 2 });
    const datum = s.modules.find((m) => m.id === "datum")!;
    expect(datum.total).toBe(0); // present but empty
    expect(s.modules[0].total).toBeGreaterThanOrEqual(s.modules[1].total);
  });
  it("computes rankings", () => {
    expect(s.rankings.topProjects[0]).toEqual({ label: "Tower A", value: 2, key: "p1" });
    expect(s.rankings.topCompanies.find((c) => c.label === "Acme")?.value).toBe(2);
  });
  it("computes risk", () => {
    expect(s.risk.projectAdmins).toBe(2);
    expect(s.risk.externalAdmins).toBe(1); // u3
    expect(s.risk.externalMembers).toBe(2); // u2, u3
    expect(s.risk.pending).toBe(1);
  });
});
