import { describe, expect, it } from "vitest";

describe("buildCompactGraphPayload", () => {
  it("normalizes users and emits distinct projects in node-id order", async () => {
    const modulePath = "./graphSnapshotPayload";
    const module = await import(modulePath).catch(() => null);

    expect(module?.buildCompactGraphPayload).toBeTypeOf("function");
    const payload = module!.buildCompactGraphPayload([
      {
        email: "Bob@External.com",
        name: "Bob",
        activeCount: 2,
        lastSignIn: null,
        firmName: "Outside",
        accountStatus: "active",
        permissionCoverage: "partial",
        projects: [{
          id: "p2",
          name: "Project 2",
          status: "active",
          isAdmin: false,
          roles: ["Viewer", "Ignored"],
          modules: ["docs"],
        }],
      },
      {
        email: "alice@hermosillo.com",
        name: "Alice",
        activeCount: 5,
        projects: [{
          id: "p1",
          name: "Project 1",
          status: "active",
          isAdmin: true,
          roles: ["Admin"],
          modules: ["build", "docs"],
          permissionStrength: 4,
        }],
      },
    ] as never);

    expect(payload.users).toEqual([
      ["bob@external.com", "Bob", 2, null, "Outside", "active", "partial"],
      ["alice@hermosillo.com", "Alice", 5, null, "", "", "unknown"],
    ]);
    expect(payload.projects.map((row: unknown[]) => row.slice(0, 7))).toEqual([
      [1, "p1", "Project 1", "active", true, "Admin", "build|docs"],
      [0, "p2", "Project 2", "active", false, "Viewer", "docs"],
    ]);
  });
});
