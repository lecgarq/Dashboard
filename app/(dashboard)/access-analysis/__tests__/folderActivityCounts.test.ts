import { describe, it, expect } from "vitest";
import {
  summarizeFolderActivity,
  summarizeFolderProjects,
  rolesByEmailForProject,
  type FolderActivityRow,
  type FolderProjectRow,
} from "../folderActivityCounts";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

const row = (folderName: string, userEmail: string, count: number, userName = userEmail): FolderActivityRow =>
  ({ folderName, userEmail, userName, count });

describe("rolesByEmailForProject", () => {
  it("keeps only memberships for the given project, keyed by email", () => {
    const m = rolesByEmailForProject(
      [
        { projectId: "p1", email: "a@x.com", roles: ["Manager"] },
        { projectId: "p2", email: "a@x.com", roles: ["Viewer"] },
      ],
      "p1",
    );
    expect(m.get("a@x.com")).toEqual(["Manager"]);
    expect(m.size).toBe(1);
  });
});

describe("summarizeFolderActivity", () => {
  it("returns an empty summary for no rows", () => {
    const s = summarizeFolderActivity([], new Map());
    expect(s.folders).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.distinctRoles).toBe(0);
  });

  it("merges same-name folders within the project and sums their activity", () => {
    const s = summarizeFolderActivity(
      [row("PDF", "a@x.com", 10), row("PDF", "b@x.com", 5)],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Manager"]]]),
    );
    expect(s.folders).toHaveLength(1);
    expect(s.folders[0].name).toBe("PDF");
    expect(s.folders[0].total).toBe(15);
  });

  it("attributes each folder's activity to the actor's role and lists users per role", () => {
    const s = summarizeFolderActivity(
      [row("ARQ", "a@x.com", 8, "Ana"), row("ARQ", "b@x.com", 2, "Ben")],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Viewer"]]]),
    );
    const arq = s.folders[0];
    expect(arq.roleSlices).toEqual([
      { name: "Manager", value: 8 },
      { name: "Viewer", value: 2 },
    ]);
    expect(arq.usersByRole.get("Manager")).toEqual([{ email: "a@x.com", name: "Ana", count: 8 }]);
    expect(arq.usersByRole.get("Viewer")).toEqual([{ email: "b@x.com", name: "Ben", count: 2 }]);
  });

  it("buckets no-role and multi-role actors into Unknown / Multiple roles", () => {
    const s = summarizeFolderActivity(
      [row("F", "ghost@x.com", 3), row("F", "multi@x.com", 4)],
      new Map([["multi@x.com", ["Admin", "Member"]]]),
    );
    const f = s.folders[0];
    const byName = new Map(f.roleSlices.map((r) => [r.name, r.value]));
    expect(byName.get(UNKNOWN_ROLE)).toBe(3);
    expect(byName.get(MULTIPLE_ROLES)).toBe(4);
  });

  it("sorts folders by total desc, role slices by value desc, and users by count desc", () => {
    const s = summarizeFolderActivity(
      [
        row("Big", "a@x.com", 9, "A"),
        row("Big", "b@x.com", 1, "B"),
        row("Small", "a@x.com", 2, "A"),
      ],
      new Map([["a@x.com", ["Role"]], ["b@x.com", ["Role"]]]),
    );
    expect(s.folders.map((f) => f.name)).toEqual(["Big", "Small"]);
    expect(s.folders[0].usersByRole.get("Role")).toEqual([
      { email: "a@x.com", name: "A", count: 9 },
      { email: "b@x.com", name: "B", count: 1 },
    ]);
    expect(s.total).toBe(12);
  });

  it("counts distinctRoles as the number of single-role names credited", () => {
    const s = summarizeFolderActivity(
      [row("F", "a@x.com", 1), row("F", "b@x.com", 1), row("F", "c@x.com", 1)],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Manager"]], ["c@x.com", ["Viewer"]]]),
    );
    expect(s.distinctRoles).toBe(2);
  });
});

describe("summarizeFolderProjects (folder-first inversion: Projects → Roles → People)", () => {
  const prow = (
    projectId: string,
    projectName: string,
    userEmail: string,
    count: number,
    userName = userEmail,
  ): FolderProjectRow => ({ projectId, projectName, userEmail, userName, count });

  const memberships = [
    { projectId: "p1", email: "ana@x.com", roles: ["Manager"] },
    { projectId: "p2", email: "ana@x.com", roles: ["Viewer"] }, // same person, different role on p2
    { projectId: "p2", email: "ben@x.com", roles: ["Viewer"] },
  ];

  it("folds rows into PROJECT nodes (name = projectName), sorted by volume desc", () => {
    const s = summarizeFolderProjects(
      [prow("p1", "Torre", "ana@x.com", 9, "Ana"), prow("p2", "Hospital", "ben@x.com", 4, "Ben")],
      memberships,
    );
    expect(s.folders.map((n) => [n.name, n.total])).toEqual([
      ["Torre", 9],
      ["Hospital", 4],
    ]);
    expect(s.total).toBe(13);
  });

  it("buckets roles per (email, project) — the same person carries their per-project role", () => {
    const s = summarizeFolderProjects(
      [prow("p1", "Torre", "ana@x.com", 9, "Ana"), prow("p2", "Hospital", "ana@x.com", 4, "Ana")],
      memberships,
    );
    const torre = s.folders.find((n) => n.name === "Torre")!;
    const hospital = s.folders.find((n) => n.name === "Hospital")!;
    expect(torre.roleSlices).toEqual([{ name: "Manager", value: 9 }]);
    expect(hospital.roleSlices).toEqual([{ name: "Viewer", value: 4 }]);
  });

  it("restores plain emails in the user drill (no projectId prefix leaks)", () => {
    const s = summarizeFolderProjects([prow("p1", "Torre", "ana@x.com", 9, "Ana")], memberships);
    const users = s.folders[0].usersByRole.get("Manager")!;
    expect(users).toEqual([{ email: "ana@x.com", name: "Ana", count: 9 }]);
  });

  it("unknown members land in the Unknown role bucket", () => {
    const s = summarizeFolderProjects([prow("p9", "Ghost", "who@x.com", 2, "Who")], memberships);
    expect(s.folders[0].roleSlices[0].name).toBe(UNKNOWN_ROLE);
  });
});
