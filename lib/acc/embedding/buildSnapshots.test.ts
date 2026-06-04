import { describe, expect, it } from "vitest";
import { buildSnapshotsFromBags } from "./buildSnapshots";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ personId: id, name: id, features: new Map(Object.entries(f)) });

describe("buildSnapshotsFromBags", () => {
  it("produces one snapshot per requested k with nodes, tiered edges, clusters", () => {
    const bags: PersonFeatureBag[] = [];
    for (let i = 0; i < 12; i++) bags.push(bag("g1_" + i, { a: 1, b: 1, p: 1 }));
    for (let i = 0; i < 12; i++) bags.push(bag("g2_" + i, { x: 1, y: 1, q: 1 }));
    const snaps = buildSnapshotsFromBags(bags, [2, 3]);
    expect(snaps.map((s) => s.k)).toEqual([2, 3]);
    const s2 = snaps[0];
    expect(s2.nodes).toHaveLength(24);
    expect(s2.clusters).toHaveLength(2);
    expect(s2.edges.length).toBeGreaterThan(0);
    expect(s2.edges.every((e) => e.tier >= 1 && e.tier <= 3)).toBe(true);
    expect(s2.edges.some((e) => e.reason.length > 0)).toBe(true);
  });
});
