import { describe, expect, it } from "vitest";
import { normalizeNeighborsPayload } from "./neighborPayload";

describe("normalizeNeighborsPayload", () => {
  it("passes a v2 payload through", () => {
    const v2 = {
      v: 2,
      matches: [{ nodeId: "u1::p1", score: 0.87, why: ["company:ACME", "act:High"] }],
      twins: { count: 12, ids: ["u2::p1", "u3::p1"] },
    };
    expect(normalizeNeighborsPayload(v2)).toEqual({
      matches: [{ nodeId: "u1::p1", score: 0.87, why: ["company:ACME", "act:High"] }],
      twins: { count: 12, ids: ["u2::p1", "u3::p1"] },
    });
  });

  it("normalizes the old bare-array shape (stale rows)", () => {
    const old = [
      { nodeId: "a::p", score: 1 },
      { nodeId: "b::p", score: 0.9 },
    ];
    expect(normalizeNeighborsPayload(old)).toEqual({
      matches: [
        { nodeId: "a::p", score: 1, why: [] },
        { nodeId: "b::p", score: 0.9, why: [] },
      ],
      twins: { count: 0, ids: [] },
    });
  });

  it("normalizes null and garbage to an empty payload", () => {
    const empty = { matches: [], twins: { count: 0, ids: [] } };
    expect(normalizeNeighborsPayload(null)).toEqual(empty);
    expect(normalizeNeighborsPayload(undefined)).toEqual(empty);
    expect(normalizeNeighborsPayload("nope")).toEqual(empty);
    expect(normalizeNeighborsPayload(42)).toEqual(empty);
    expect(normalizeNeighborsPayload({ v: 2 })).toEqual(empty);
  });

  it("drops malformed match entries, keeps valid ones", () => {
    const raw = {
      matches: [
        { nodeId: "ok::p", score: 0.5 }, // missing why -> defaults []
        { nodeId: "", score: 0.4 },
        { nodeId: "bad::p", score: NaN },
        { nodeId: "bad2::p" },
        null,
        "junk",
        { nodeId: "ok2::p", score: 0.3, why: ["role:x", 7, "mod:y"] }, // non-strings dropped
      ],
      twins: { count: 2.7, ids: ["t1::p", 5, ""] },
    };
    expect(normalizeNeighborsPayload(raw)).toEqual({
      matches: [
        { nodeId: "ok::p", score: 0.5, why: [] },
        { nodeId: "ok2::p", score: 0.3, why: ["role:x", "mod:y"] },
      ],
      twins: { count: 2, ids: ["t1::p"] },
    });
  });

  it("defaults missing/negative twins to zero", () => {
    expect(normalizeNeighborsPayload({ matches: [] }).twins).toEqual({ count: 0, ids: [] });
    expect(
      normalizeNeighborsPayload({ matches: [], twins: { count: -3, ids: null } }).twins,
    ).toEqual({ count: 0, ids: [] });
  });
});
