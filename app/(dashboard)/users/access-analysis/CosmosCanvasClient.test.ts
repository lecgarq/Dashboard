import { describe, expect, it, vi } from "vitest";
import { Selection } from "@uwdata/mosaic-core";
import { CosmosCanvasClient } from "./CosmosCanvasClient";

function makeHandle(nodeIds: string[]) {
  return {
    nodeIds,
    setAlphaMask: vi.fn(),
  };
}

describe("CosmosCanvasClient", () => {
  it("builds an alpha mask: 1.0 for selected, 0.15 for unselected", () => {
    const handle = makeHandle(["a", "b", "c", "d"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });

    client.queryResult({ toArray: () => [{ node_id: "b" }, { node_id: "d" }] });

    expect(handle.setAlphaMask).toHaveBeenCalledTimes(1);
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    // Float32Array stores 0.15 as ~0.1500000060 — use toBeCloseTo for DIM values.
    expect(mask[0]).toBeCloseTo(0.15, 5);
    expect(mask[1]).toBe(1.0);
    expect(mask[2]).toBeCloseTo(0.15, 5);
    expect(mask[3]).toBe(1.0);
  });

  it("dims everything when the selection result is empty", () => {
    const handle = makeHandle(["a", "b"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });
    client.queryResult({ toArray: () => [] });
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    expect(mask[0]).toBeCloseTo(0.15, 5);
    expect(mask[1]).toBeCloseTo(0.15, 5);
  });

  it("returns full opacity when the selection has no clauses (idle state)", () => {
    const handle = makeHandle(["a", "b"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });
    client.queryResult({ toArray: () => [{ node_id: "a" }, { node_id: "b" }] });
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    expect(mask[0]).toBe(1.0);
    expect(mask[1]).toBe(1.0);
  });
});
