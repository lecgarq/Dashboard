import { describe, it, expect } from "vitest";
import { parseNodeId, deriveSameUserEdges, toCosmosLinks } from "./sameUserEdges";

describe("parseNodeId", () => {
  it("splits on the first '::'", () => {
    expect(parseNodeId("a@x.com::proj-1")).toEqual({ userId: "a@x.com", projectId: "proj-1" });
  });
  it("returns null for malformed ids", () => {
    expect(parseNodeId("noseparator")).toBeNull();
    expect(parseNodeId("::proj")).toBeNull();
    expect(parseNodeId("user::")).toBeNull();
    expect(parseNodeId("")).toBeNull();
  });
});

describe("deriveSameUserEdges", () => {
  it("one user / one project → 0 edges", () => {
    const r = deriveSameUserEdges(["u1::p1"]);
    expect(r.edges).toHaveLength(0);
    expect(r.distinctValidUsers).toBe(1);
    expect(r.distinctUsersWithEdges).toBe(0);
  });

  it("one user / three projects → 2 chain edges in deterministic order", () => {
    const r = deriveSameUserEdges(["u1::p3", "u1::p1", "u1::p2"]);
    expect(r.edges.map((e) => [e.sourceIndex, e.targetIndex])).toEqual([
      [1, 2],
      [2, 0],
    ]);
    expect(r.edges.every((e) => e.userId === "u1" && e.edgeType === "same-user")).toBe(true);
  });

  it("two users → two separated chains, no cross-user edges", () => {
    const r = deriveSameUserEdges(["u1::p1", "u2::p1", "u1::p2", "u2::p2"]);
    expect(r.edges).toHaveLength(2);
    expect(new Set(r.edges.map((e) => e.userId))).toEqual(new Set(["u1", "u2"]));
    expect(r.edges.every((e) => e.sourceIndex !== e.targetIndex)).toBe(true);
  });

  it("skips malformed nodeIds and counts them", () => {
    const r = deriveSameUserEdges(["u1::p1", "bad", "u1::p2"]);
    expect(r.malformedCount).toBe(1);
    expect(r.edges).toHaveLength(1);
  });

  it("reports duplicate nodeIds and does not corrupt chains", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p1", "u1::p2"]);
    expect(r.duplicateCount).toBe(1);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ sourceIndex: 0, targetIndex: 2 });
  });

  it("has no self-edges or duplicate edges", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p2", "u1::p3"]);
    const seen = new Set(r.edges.map((e) => `${e.sourceIndex}-${e.targetIndex}`));
    expect(seen.size).toBe(r.edges.length);
    expect(r.edges.some((e) => e.sourceIndex === e.targetIndex)).toBe(false);
  });

  it("satisfies the edge-count invariant", () => {
    const ids = ["u1::p1", "u1::p2", "u2::p1", "bad", "u1::p1", "u3::p1"];
    const r = deriveSameUserEdges(ids);
    const validUnique = ids.length - r.malformedCount - r.duplicateCount;
    expect(r.edges.length).toBe(validUnique - r.distinctValidUsers);
  });
});

describe("toCosmosLinks", () => {
  it("flattens to [s0,t0,s1,t1,...] Float32Array", () => {
    const r = deriveSameUserEdges(["u1::p1", "u1::p2"]);
    const links = toCosmosLinks(r.edges);
    expect(links).toBeInstanceOf(Float32Array);
    expect(Array.from(links)).toEqual([0, 1]);
  });
});
