import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import { knnEdges, tierEdges, humanizeFeature } from "./cosineGraph";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ personId: id, name: id, features: new Map(Object.entries(f)) });

describe("knnEdges + tierEdges", () => {
  it("connects identical people with score ~1 and keeps a<b", () => {
    const e = buildEmbedding([bag("a", { p1: 1, p2: 1 }), bag("b", { p1: 1, p2: 1 }), bag("c", { z: 1 })], 1);
    const edges = knnEdges(e, 6, 0.3);
    const ab = edges.find((x) => x.a === 0 && x.b === 1);
    expect(ab).toBeTruthy();
    expect(ab!.score).toBeGreaterThan(0.99);
  });

  it("tiers split top 20% / next 40% / rest", () => {
    const edges = Array.from({ length: 10 }, (_, i) => ({ a: 0, b: i + 1, score: (i + 1) / 10 }));
    const tiered = tierEdges(edges, []);
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const t of tiered) counts[t.tier]++;
    expect(counts[1]).toBe(2); // top 20%
    expect(counts[2]).toBe(4); // next 40%
    expect(counts[3]).toBe(4);
  });
});

describe("humanizeFeature", () => {
  it("maps feature prefixes to readable phrases", () => {
    expect(humanizeFeature("proj:abc")).toBe("shared project");
    expect(humanizeFeature("act:upload-entity")).toBe("activity: upload-entity");
  });
});
