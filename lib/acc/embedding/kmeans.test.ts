import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import { sphericalKMeans } from "./kmeans";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ personId: id, name: id, features: new Map(Object.entries(f)) });

describe("sphericalKMeans", () => {
  it("separates two clearly distinct groups", () => {
    const bags: PersonFeatureBag[] = [];
    for (let i = 0; i < 10; i++) bags.push(bag("g1_" + i, { a: 1, b: 1 }));
    for (let i = 0; i < 10; i++) bags.push(bag("g2_" + i, { x: 1, y: 1 }));
    const e = buildEmbedding(bags, 1);
    const c = sphericalKMeans(e, 2, 42);
    const g1 = new Set([...Array(10)].map((_, i) => c.assign[i]));
    const g2 = new Set([...Array(10)].map((_, i) => c.assign[i + 10]));
    expect(g1.size).toBe(1);
    expect(g2.size).toBe(1);
    expect([...g1][0]).not.toBe([...g2][0]);
  });

  it("is deterministic for a fixed seed", () => {
    const e = buildEmbedding([bag("a", { a: 1 }), bag("b", { b: 1 }), bag("c", { a: 1 })], 1);
    const c1 = sphericalKMeans(e, 2, 7);
    const c2 = sphericalKMeans(e, 2, 7);
    expect([...c1.assign]).toEqual([...c2.assign]);
  });
});
