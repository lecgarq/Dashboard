import { describe, expect, it } from "vitest";

import {
  SIMILARITY_DIMS,
  type SimilarityDim,
  type SimilarityInput,
  computeSimilarityEdges,
} from "./userSimilarity";

const ALL_DIMS = new Set<SimilarityDim>(SIMILARITY_DIMS);

function user(
  id: string,
  overrides: Partial<SimilarityInput["users"][number]> = {},
): SimilarityInput["users"][number] {
  return {
    id,
    company: overrides.company ?? null,
    adminTier: overrides.adminTier ?? null,
    roleIds: overrides.roleIds ?? [],
    projectIds: overrides.projectIds ?? [],
    folderIds: overrides.folderIds ?? [],
  };
}

describe("computeSimilarityEdges", () => {
  it("returns [] for empty users", () => {
    expect(computeSimilarityEdges({ users: [] }, ALL_DIMS, 1)).toEqual([]);
  });

  it("returns [] for single user", () => {
    const input: SimilarityInput = {
      users: [user("a", { roleIds: ["r1"] })],
    };
    expect(computeSimilarityEdges(input, ALL_DIMS, 1)).toEqual([]);
  });

  it("emits one edge for two users sharing one role with minShared=1", () => {
    const input: SimilarityInput = {
      users: [user("b", { roleIds: ["r1"] }), user("a", { roleIds: ["r1"] })],
    };
    const edges = computeSimilarityEdges(input, new Set(["roles"]), 1);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      userA: "a",
      userB: "b",
      dimension: "roles",
      sharedCount: 1,
    });
  });

  it("suppresses below-threshold edges at default minShared=2", () => {
    const input: SimilarityInput = {
      users: [user("a", { roleIds: ["r1"] }), user("b", { roleIds: ["r1"] })],
    };
    const edges = computeSimilarityEdges(input, ALL_DIMS);
    expect(edges).toHaveLength(0);
  });

  it("emits 5 parallel edges — one per enabled dimension — when all dims share", () => {
    const input: SimilarityInput = {
      users: [
        user("a", {
          company: "Acme",
          adminTier: "hub",
          roleIds: ["r1", "r2", "r3"],
          projectIds: ["p1", "p2"],
          folderIds: ["f1", "f2", "f3", "f4"],
        }),
        user("b", {
          company: "Acme",
          adminTier: "hub",
          roleIds: ["r1", "r2", "r3"],
          projectIds: ["p1", "p2"],
          folderIds: ["f1", "f2", "f3", "f4"],
        }),
      ],
    };
    const edges = computeSimilarityEdges(input, ALL_DIMS, 1);
    expect(edges).toHaveLength(5);

    const byDim = new Map(edges.map((e) => [e.dimension, e]));
    expect(byDim.get("roles")?.sharedCount).toBe(3);
    expect(byDim.get("projects")?.sharedCount).toBe(2);
    expect(byDim.get("company")?.sharedCount).toBe(1);
    expect(byDim.get("admin-tier")?.sharedCount).toBe(1);
    expect(byDim.get("folder-access")?.sharedCount).toBe(4);

    for (const e of edges) {
      expect(e.userA < e.userB).toBe(true);
    }
  });

  it("emits only edges for enabled dimensions", () => {
    const input: SimilarityInput = {
      users: [
        user("a", {
          company: "Acme",
          adminTier: "hub",
          roleIds: ["r1", "r2", "r3"],
          projectIds: ["p1", "p2"],
          folderIds: ["f1", "f2", "f3", "f4"],
        }),
        user("b", {
          company: "Acme",
          adminTier: "hub",
          roleIds: ["r1", "r2", "r3"],
          projectIds: ["p1", "p2"],
          folderIds: ["f1", "f2", "f3", "f4"],
        }),
      ],
    };
    const edges = computeSimilarityEdges(input, new Set(["roles"]), 1);
    expect(edges).toHaveLength(1);
    expect(edges[0].dimension).toBe("roles");
  });

  it("emits canonical-deduped pairs for three users in same role bucket", () => {
    const input: SimilarityInput = {
      users: [
        user("c", { roleIds: ["r1"] }),
        user("a", { roleIds: ["r1"] }),
        user("b", { roleIds: ["r1"] }),
      ],
    };
    const edges = computeSimilarityEdges(input, new Set(["roles"]), 1);
    expect(edges).toHaveLength(3);
    const keys = edges.map((e) => `${e.userA}|${e.userB}`).sort();
    expect(keys).toEqual(["a|b", "a|c", "b|c"]);
    for (const e of edges) {
      expect(e.userA < e.userB).toBe(true);
    }
  });

  it("excludes null company / null adminTier from buckets", () => {
    const input: SimilarityInput = {
      users: [
        user("a", { company: null, adminTier: null }),
        user("b", { company: null, adminTier: null }),
      ],
    };
    const edges = computeSimilarityEdges(
      input,
      new Set(["company", "admin-tier"]),
      1,
    );
    expect(edges).toHaveLength(0);
  });

  it("performance smoke: 500 users x 10 random roles, minShared=2, < 500ms", () => {
    const rand = (() => {
      let s = 1337;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
    })();

    const ROLE_POOL = 50;
    const users = Array.from({ length: 500 }, (_, i) => {
      const roleIds: string[] = [];
      const seen = new Set<number>();
      while (roleIds.length < 10) {
        const r = Math.floor(rand() * ROLE_POOL);
        if (!seen.has(r)) {
          seen.add(r);
          roleIds.push(`role-${r}`);
        }
      }
      return user(`u-${i.toString().padStart(4, "0")}`, { roleIds });
    });

    const start = performance.now();
    const edges = computeSimilarityEdges({ users }, ALL_DIMS, 2);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(Array.isArray(edges)).toBe(true);
  });
});
