import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import type { PersonFeatureBag } from "./types";

const bag = (personId: string, features: Record<string, number>): PersonFeatureBag => ({
  personId, name: personId, features: new Map(Object.entries(features)),
});

describe("buildEmbedding", () => {
  it("drops singleton features (min_df >= 2)", () => {
    const bags = [bag("a", { shared: 1, onlyA: 1 }), bag("b", { shared: 1 })];
    const e = buildEmbedding(bags, 2);
    expect(e.featureKeys).toContain("shared");
    expect(e.featureKeys).not.toContain("onlyA");
  });

  it("L2-normalizes each person vector", () => {
    const bags = [bag("a", { x: 3, y: 4 }), bag("b", { x: 1, y: 1 })];
    const e = buildEmbedding(bags, 1);
    const norm = Math.hypot(...e.persons[0].val);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("weights rare features higher than common ones (idf)", () => {
    const bags = [bag("a", { common: 1, rare: 1 }), bag("b", { common: 1 }), bag("c", { common: 1 })];
    const e = buildEmbedding(bags, 1);
    const a = e.persons[0];
    const wCommon = a.val[a.idx.indexOf(e.featureKeys.indexOf("common"))];
    const wRare = a.val[a.idx.indexOf(e.featureKeys.indexOf("rare"))];
    expect(wRare).toBeGreaterThan(wCommon);
  });
});
