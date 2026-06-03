import { describe, it, expect } from "vitest";
import { buildGraphNodesFromUsers } from "./graphNodesFromUsers";
import type { BulkAccUser, BulkAccProject } from "@/lib/acc/acc-types";

function mkProject(p: Partial<BulkAccProject> & { id: string }): BulkAccProject {
  return {
    name: `Project ${p.id}`,
    status: "active",
    isAdmin: false,
    roles: [],
    modules: [],
    ...p,
  };
}

function mkUser(u: Partial<BulkAccUser> & { email: string }): BulkAccUser {
  return {
    name: "",
    found: true,
    projectCount: u.projects?.length ?? 0,
    activeCount: 0,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-01-01T00:00:00Z",
    allRoles: [],
    allModules: [],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
    ...u,
  };
}

describe("buildGraphNodesFromUsers", () => {
  it("produces one sorted, distinct node per user::project (matches loadNodeIds DISTINCT ... ORDER BY 1)", () => {
    const users = [
      mkUser({ email: "Bob@External.com", name: "Bob", projects: [mkProject({ id: "p1" })] }),
      mkUser({
        email: "alice@hermosillo.com",
        name: "Alice",
        projects: [mkProject({ id: "p2" }), mkProject({ id: "p1" })],
      }),
    ];
    const { nodeIds } = buildGraphNodesFromUsers(users);
    // user_id = email.trim().toLowerCase(); sorted ascending by "user::project"
    expect(nodeIds).toEqual([
      "alice@hermosillo.com::p1",
      "alice@hermosillo.com::p2",
      "bob@external.com::p1",
    ]);
  });

  it("returns features aligned 1:1 with nodeIds (index === node order)", () => {
    const users = [
      mkUser({ email: "a@x.com", projects: [mkProject({ id: "p1" }), mkProject({ id: "p2" })] }),
    ];
    const { nodeIds, features } = buildGraphNodesFromUsers(users);
    expect(features).toHaveLength(nodeIds.length);
    features.forEach((f, i) => expect(f.nodeId).toBe(nodeIds[i]));
  });

  it("maps core feature fields from the user + project", () => {
    const users = [
      mkUser({
        email: "alice@hermosillo.com",
        name: "Alice Smith",
        activeCount: 25,
        projects: [
          mkProject({
            id: "p1",
            name: "Tower A",
            roles: ["Project Manager"],
            modules: ["docs", "cost", "build"],
            isAdmin: true,
          }),
        ],
      }),
    ];
    const { features } = buildGraphNodesFromUsers(users);
    const f = features[0];
    expect(f.nodeId).toBe("alice@hermosillo.com::p1");
    expect(f.userName).toBe("Alice Smith");
    expect(f.project).toBe("Tower A");
    expect(f.role).toBe("Project Manager");
    expect(f.isAdmin).toBe(true);
    expect(f.activityCountRaw).toBe(25);
    expect(f.activityBucket).toBe("Med"); // 11..100
    // module signature strips baseline modules (insight/docs), keeps the rest sorted
    expect(f.moduleSignature).toEqual(["build", "cost"]);
  });

  it("collapses multiple roles in one project into a single node", () => {
    const users = [
      mkUser({ email: "a@x.com", projects: [mkProject({ id: "p1", roles: ["Admin", "Viewer"] })] }),
    ];
    const { nodeIds, features } = buildGraphNodesFromUsers(users);
    expect(nodeIds).toEqual(["a@x.com::p1"]);
    expect(features).toHaveLength(1);
  });

  it("defaults an empty-role project to role 'Unknown'", () => {
    const users = [mkUser({ email: "a@x.com", projects: [mkProject({ id: "p1", roles: [] })] })];
    const { features } = buildGraphNodesFromUsers(users);
    expect(features[0].role).toBe("Unknown");
  });

  it("emits no nodes for a user with no projects", () => {
    const users = [mkUser({ email: "nobody@x.com", projects: [] })];
    const { nodeIds, features } = buildGraphNodesFromUsers(users);
    expect(nodeIds).toEqual([]);
    expect(features).toEqual([]);
  });
});
