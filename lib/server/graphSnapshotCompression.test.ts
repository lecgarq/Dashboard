import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

describe("getCompressedGraphSnapshot", () => {
  it("packs the compact graph payload once per cached user array", async () => {
    const modulePath = "./graphSnapshotCompression";
    const module = await import(modulePath).catch(() => null);

    expect(module?.getCompressedGraphSnapshot).toBeTypeOf("function");
    const users = [{
      email: "alice@hermosillo.com",
      name: "Alice",
      activeCount: 3,
      projects: [{
        id: "p1",
        name: "Project 1",
        status: "active",
        isAdmin: false,
        roles: ["Viewer"],
        modules: ["docs"],
      }],
    }] as never;
    const first = module!.getCompressedGraphSnapshot(users);
    const second = module!.getCompressedGraphSnapshot(users);
    const payload = JSON.parse(
      gunzipSync(Buffer.from(first.gzipBase64, "base64")).toString("utf8"),
    );

    expect(second).toBe(first);
    expect(payload.projects[0].slice(0, 7)).toEqual([
      0, "p1", "Project 1", "active", false, "Viewer", "docs",
    ]);
  });
});
