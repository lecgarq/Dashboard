import { describe, it, expect } from "vitest";
import { buildInstanceView, type RawDc } from "../accessInstanceView";

const raw: RawDc = {
  projectUsers: [
    { projectId: "p1", userId: "u1", status: "active", addedOn: new Date("2024-01-01") },
    { projectId: "p1", userId: "u2", status: "pending", addedOn: null },
  ],
  users: [
    { id: "u1", email: "ANA@hermosillo.com", name: "Ana" },
    { id: "u2", email: "bob@acme.com", name: "Bob" },
  ],
  projects: [{ id: "p1", name: "Tower A" }],
  products: [
    { projectId: "p1", userId: "u1", productKey: "build", accessLevel: "project_admin" },
    { projectId: "p1", userId: "u2", productKey: "docs", accessLevel: "project_user" },
  ],
  roles: [{ projectId: "p1", userId: "u1", roleId: "r1" }],
  roleNames: [{ id: "r1", name: "Project Admin" }],
  companies: [{ projectId: "p1", userId: "u1", companyId: "c1" }],
  companyNames: [{ id: "c1", name: "Hermosillo" }],
};

describe("buildInstanceView", () => {
  const view = buildInstanceView(raw);
  it("creates one instance per project-user with joined fields", () => {
    expect(view).toHaveLength(2);
    const ana = view.find((v) => v.userId === "u1")!;
    expect(ana).toMatchObject({
      projectName: "Tower A", name: "Ana", isInternal: true, isAdmin: true,
      company: "Hermosillo", roles: ["Project Admin"], modules: ["build"], adminModules: ["build"],
    });
    expect(ana.email).toBe("ana@hermosillo.com"); // lowercased
    expect(ana.addedOn).toBe("2024-01-01");
  });
  it("flags external + non-admin correctly and tolerates missing joins", () => {
    const bob = view.find((v) => v.userId === "u2")!;
    expect(bob).toMatchObject({ isInternal: false, isAdmin: false, company: null, roles: [], modules: ["dataManagement"] });
  });
});
