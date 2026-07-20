import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";

describe("buildGraphNodesFromCompactPayload", () => {
  it("hydrates aligned graph features from compact tuples", async () => {
    const modulePath = "./graphNodesFromCompactPayload";
    const module = await import(modulePath).catch(() => null);

    expect(module?.buildGraphNodesFromCompactPayload).toBeTypeOf("function");
    const graph = module!.buildGraphNodesFromCompactPayload({
      users: [["alice@hermosillo.com", "Alice", 25, null, "LECG", "active", "known"]],
      projects: [[
        0,
        "p1",
        "Tower A",
        "active",
        true,
        "Project Manager",
        "docs|cost|build",
        null,
        null,
        4,
        12,
        2048,
        false,
        true,
        { view: 5 },
        { file_view: 5 },
        5,
        null,
      ]],
    });

    expect(graph.nodeIds).toEqual(["alice@hermosillo.com::p1"]);
    expect(graph.features[0]).toMatchObject({
      nodeId: "alice@hermosillo.com::p1",
      userName: "Alice",
      project: "Tower A",
      role: "Project Manager",
      activityCountRaw: 25,
      moduleSignature: ["build", "cost"],
      permissionStrength: 4,
      activityTotal: 5,
    });
  });

  it("decodes a gzip-packed snapshot", async () => {
    const modulePath = "./graphNodesFromCompactPayload";
    const module = await import(modulePath).catch(() => null);
    const payload = {
      users: [["alice@hermosillo.com", "Alice", 0, null, "", "", "unknown"]],
      projects: [],
    };

    expect(module?.decodeCompressedGraphSnapshot).toBeTypeOf("function");
    await expect(module!.decodeCompressedGraphSnapshot({
      gzipBase64: gzipSync(JSON.stringify(payload)).toString("base64"),
    })).resolves.toEqual(payload);
  });
});
