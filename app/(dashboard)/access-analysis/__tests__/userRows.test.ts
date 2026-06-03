import { describe, it, expect } from "vitest";
import { buildUserRows } from "../userRows";
import type { AccessInstance } from "../types";

const mk = (o: Partial<AccessInstance>): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "Ana", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles: ["Architect"], modules: ["build"], adminModules: [], ...o,
});

describe("buildUserRows", () => {
  it("collapses one user's many projects into a single row and unions their access", () => {
    const rows = buildUserRows([
      mk({ userId: "u1", projectId: "p1", projectName: "Tower A", modules: ["build"], roles: ["Architect"], company: "Hermosillo" }),
      mk({ userId: "u1", projectId: "p2", projectName: "Tower B", modules: ["insight"], roles: ["Owner"], company: "Hermosillo", isAdmin: true, adminModules: ["insight"] }),
    ]);
    expect(rows).toHaveLength(1);
    const u = rows[0];
    expect(u.projectCount).toBe(2);
    expect(u.modules.sort()).toEqual(["build", "insight"].sort());
    expect(u.roles).toEqual(["Architect", "Owner"]);
    expect(u.companies).toEqual(["Hermosillo"]); // deduped
    expect(u.isAdminAnywhere).toBe(true);        // admin in p2
    expect(u.projects).toHaveLength(2);
  });

  it("preserves per-project detail for the expand view, sorted by project name", () => {
    const rows = buildUserRows([
      mk({ userId: "u1", projectId: "p2", projectName: "Zeta" }),
      mk({ userId: "u1", projectId: "p1", projectName: "Alpha", isAdmin: true, adminModules: ["build"] }),
    ]);
    const projects = rows[0].projects;
    expect(projects.map((p) => p.project)).toEqual(["Alpha", "Zeta"]);
    expect(projects[0].access).toBe("Admin");
    expect(projects[1].access).toBe("Member");
  });

  it("keeps distinct users as distinct rows, sorted by name", () => {
    const rows = buildUserRows([
      mk({ userId: "u2", name: "Bob", email: "b@acme.com", isInternal: false, company: "Acme" }),
      mk({ userId: "u1", name: "Ana", email: "a@hermosillo.com", isInternal: true }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bob"]);
    expect(rows.find((r) => r.userId === "u2")!.type).toBe("External");
  });

  it("joins multiple roles within a project into one cell", () => {
    const rows = buildUserRows([mk({ roles: ["Architect", "Owner"] })]);
    expect(rows[0].projects[0].role).toBe("Architect; Owner");
    expect(rows[0].roles).toEqual(["Architect", "Owner"]);
  });
});
