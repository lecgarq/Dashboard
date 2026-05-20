import { describe, expect, it } from "vitest";

import {
  SIMILARITY_DIMS,
  combinedPairForce,
  computeSimilarityEdges,
  pairSimilarity,
  topKNeighbors,
  type SimilarityDim,
  type SimilarityInput,
  type SimilarityUser,
} from "./userSimilarity";

const ALL_DIMS = new Set<SimilarityDim>(SIMILARITY_DIMS);

function user(
  id: string,
  overrides: Partial<SimilarityUser> = {},
): SimilarityUser {
  return {
    id,
    projectIds: overrides.projectIds ?? [],
    roleIds: overrides.roleIds ?? [],
    folderIds: overrides.folderIds ?? [],
    activityFileIds: overrides.activityFileIds ?? [],
    coverageFlags: overrides.coverageFlags ?? [],
    lastSignIn: overrides.lastSignIn ?? null,
    addedAt: overrides.addedAt ?? null,
    isAdmin: overrides.isAdmin,
    isExternal: overrides.isExternal,
    companyRole: "companyRole" in overrides ? overrides.companyRole : undefined,
    moduleIds: overrides.moduleIds,
    firmId: "firmId" in overrides ? overrides.firmId : undefined,
  };
}

describe("SIMILARITY_DIMS", () => {
  it("has twelve entries (Phase 07.1 base + 4 axes 2026-05-18 + firm-affiliation 2026-05-20)", () => {
    expect(SIMILARITY_DIMS).toEqual([
      "project-members",
      "roles",
      "folder-permissions",
      "activity-logs",
      "data-coverage",
      "last-sign-in",
      "recent-additions",
      "admin-tier",
      "internal-external",
      "company-role",
      "module-mix",
      "firm-affiliation",
    ]);
  });
});

describe("pairSimilarity — binary + new axes", () => {
  it("admin-tier: same admin status returns 1, mismatch returns 0", () => {
    const a = user("a", { isAdmin: true });
    const b = user("b", { isAdmin: true });
    const c = user("c", { isAdmin: false });
    expect(pairSimilarity(a, b, "admin-tier")).toBe(1);
    expect(pairSimilarity(a, c, "admin-tier")).toBe(0);
  });

  it("internal-external: missing flag treated as internal (false)", () => {
    const a = user("a", {});
    const b = user("b", {});
    expect(pairSimilarity(a, b, "internal-external")).toBe(1);
  });

  it("company-role: null vs null clusters as the 'Unspecified' bucket", () => {
    const a = user("a", { companyRole: null });
    const b = user("b", { companyRole: null });
    const c = user("c", { companyRole: "PM" });
    expect(pairSimilarity(a, b, "company-role")).toBe(1);
    expect(pairSimilarity(a, c, "company-role")).toBe(0);
  });

  it("module-mix: set-overlap on moduleIds, normalized by min size", () => {
    const a = user("a", { moduleIds: ["docs", "build", "cost"] });
    const b = user("b", { moduleIds: ["docs", "build"] });
    // 2 shared / min(3, 2) = 1.0
    expect(pairSimilarity(a, b, "module-mix")).toBeCloseTo(1.0, 5);
  });
});

describe("pairSimilarity — set-overlap dims", () => {
  it("normalizes shared count by min(|A|, |B|)", () => {
    const a = user("a", { projectIds: ["p1", "p2", "p3"] });
    const b = user("b", { projectIds: ["p1", "p2"] });
    // 2 shared / min(3, 2) = 1.0
    expect(pairSimilarity(a, b, "project-members")).toBeCloseTo(1.0, 5);
  });

  it("returns 0 when no overlap", () => {
    const a = user("a", { projectIds: ["p1"] });
    const b = user("b", { projectIds: ["p9"] });
    expect(pairSimilarity(a, b, "project-members")).toBe(0);
  });

  it("returns 0 when either set is empty", () => {
    const a = user("a", { projectIds: [] });
    const b = user("b", { projectIds: ["p1"] });
    expect(pairSimilarity(a, b, "project-members")).toBe(0);
  });

  it("computes role overlap independently of project overlap", () => {
    const a = user("a", { roleIds: ["r1", "r2"], projectIds: ["p1"] });
    const b = user("b", { roleIds: ["r1", "r2"], projectIds: ["p9"] });
    expect(pairSimilarity(a, b, "roles")).toBeCloseTo(1.0, 5);
    expect(pairSimilarity(a, b, "project-members")).toBe(0);
  });

  it("handles folder, activity, and coverage dims symmetrically", () => {
    const a = user("a", {
      folderIds: ["f1", "f2"],
      activityFileIds: ["af1"],
      coverageFlags: ["has-signin", "has-activity"],
    });
    const b = user("b", {
      folderIds: ["f1"],
      activityFileIds: ["af1", "af2"],
      coverageFlags: ["has-signin"],
    });
    expect(pairSimilarity(a, b, "folder-permissions")).toBeCloseTo(1.0, 5); // 1/min(2,1)
    expect(pairSimilarity(a, b, "activity-logs")).toBeCloseTo(1.0, 5); // 1/min(1,2)
    expect(pairSimilarity(a, b, "data-coverage")).toBeCloseTo(1.0, 5); // 1/min(2,1)
  });
});

describe("pairSimilarity — temporal dims", () => {
  it("returns ~1.0 for users with same lastSignIn", () => {
    const t = Date.now();
    const a = user("a", { lastSignIn: t });
    const b = user("b", { lastSignIn: t });
    expect(pairSimilarity(a, b, "last-sign-in")).toBeCloseTo(1.0, 3);
  });

  it("returns 0 if either user has null lastSignIn", () => {
    const a = user("a", { lastSignIn: null });
    const b = user("b", { lastSignIn: Date.now() });
    expect(pairSimilarity(a, b, "last-sign-in")).toBe(0);
  });

  it("decays with distance for recent-additions", () => {
    const t = Date.now();
    const a = user("a", { addedAt: t });
    const b = user("b", { addedAt: t - 30 * 86_400_000 });
    // 30 days apart with tau=30 → 1/e
    expect(pairSimilarity(a, b, "recent-additions")).toBeCloseTo(
      Math.exp(-1),
      3,
    );
  });
});

describe("combinedPairForce", () => {
  it("sums strength × score across all dims when simMin gate passes", () => {
    const a = user("a", { projectIds: ["p1"], roleIds: ["r1"] });
    const b = user("b", { projectIds: ["p1"], roleIds: ["r1"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
      ["roles", 0.5],
    ]);
    // sim("project-members")=1.0, sim("roles")=1.0 → 1.0*1.0 + 0.5*1.0 = 1.5
    expect(combinedPairForce(a, b, strengths, 1)).toBeCloseTo(1.5, 5);
  });

  it("returns 0 when fewer than simMin dims contribute non-zero", () => {
    const a = user("a", { projectIds: ["p1"] });
    const b = user("b", { projectIds: ["p1"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
    ]);
    // Only 1 dim contributes; simMin=3 → gated to 0.
    expect(combinedPairForce(a, b, strengths, 3)).toBe(0);
  });

  it("treats strength=0 as 'dim disabled' (does NOT count toward simMin)", () => {
    const a = user("a", { projectIds: ["p1"], roleIds: ["r1"] });
    const b = user("b", { projectIds: ["p1"], roleIds: ["r1"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 0],
      ["roles", 1.0],
    ]);
    // Only roles contributes (1 dim); simMin=2 → gated to 0.
    expect(combinedPairForce(a, b, strengths, 2)).toBe(0);
  });

  it("returns 0 for users with no shared attributes at all", () => {
    const a = user("a", { projectIds: ["p1"] });
    const b = user("b", { projectIds: ["p9"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
    ]);
    expect(combinedPairForce(a, b, strengths, 1)).toBe(0);
  });
});

describe("topKNeighbors", () => {
  it("returns at most K neighbors per user, sorted by force desc", () => {
    // 10 users sharing one project each across 2 project buckets.
    const users: SimilarityUser[] = [];
    for (let i = 0; i < 10; i++) {
      users.push(user(`u${i}`, { projectIds: [`p${i % 2}`] }));
    }
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
    ]);
    const result = topKNeighbors({ users }, strengths, 1, 3);
    const u0 = result.get("u0");
    expect(u0).toBeDefined();
    expect(u0!.length).toBeLessThanOrEqual(3);
    // Verify sort order.
    for (let i = 0; i + 1 < u0!.length; i++) {
      expect(u0![i].force).toBeGreaterThanOrEqual(u0![i + 1].force);
    }
  });

  it("returns an empty list for users with no positive-force pairs", () => {
    const u1 = user("solo", { projectIds: ["lonely"] });
    const u2 = user("other", { projectIds: ["different"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
    ]);
    const result = topKNeighbors({ users: [u1, u2] }, strengths, 1, 5);
    expect(result.get("solo") ?? []).toEqual([]);
  });

  it("captures a dominant dim when multiple dims contribute", () => {
    const a = user("a", { projectIds: ["p1"], roleIds: ["r1", "r2", "r3"] });
    const b = user("b", { projectIds: ["p1"], roleIds: ["r1", "r2", "r3"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 0.2],
      ["roles", 1.0],
    ]);
    const result = topKNeighbors({ users: [a, b] }, strengths, 1, 5);
    // roles contributes 1.0 × 1.0 = 1.0; projects contributes 0.2 × 1.0 = 0.2.
    // Roles wins as dominant.
    expect(result.get("a")?.[0]?.dominantDim).toBe("roles");
  });
});

describe("computeSimilarityEdges — backward-compat surface", () => {
  it("emits edges with normalized score, not raw count", () => {
    const a = user("a", { roleIds: ["r1", "r2"] });
    const b = user("b", { roleIds: ["r1", "r2"] });
    const edges = computeSimilarityEdges(
      { users: [a, b] },
      new Set<SimilarityDim>(["roles"]),
      0.01,
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].score).toBeCloseTo(1.0, 5);
    expect(edges[0].dimension).toBe("roles");
  });

  it("suppresses below-minScore edges", () => {
    const a = user("a", { roleIds: ["r1", "r2", "r3", "r4"] });
    const b = user("b", { roleIds: ["r1"] }); // 1/min(4,1)=1.0 — still above
    const edges = computeSimilarityEdges(
      { users: [a, b] },
      new Set<SimilarityDim>(["roles"]),
      1.5, // unreachable threshold
    );
    expect(edges).toHaveLength(0);
  });

  it("returns [] for empty users", () => {
    expect(
      computeSimilarityEdges({ users: [] }, ALL_DIMS, 0.01),
    ).toEqual([]);
  });
});

describe("firm-affiliation dim", () => {
  const mk = (o: Partial<SimilarityUser>): SimilarityUser => ({
    id: "x",
    projectIds: [],
    roleIds: [],
    folderIds: [],
    activityFileIds: [],
    coverageFlags: [],
    lastSignIn: null,
    addedAt: null,
    ...o,
  });

  it("is registered", () =>
    expect(SIMILARITY_DIMS).toContain("firm-affiliation"));

  it("scores 1 for same firm, 0 for different/missing", () => {
    expect(
      pairSimilarity(mk({ firmId: "c1" }), mk({ firmId: "c1" }), "firm-affiliation"),
    ).toBe(1);
    expect(
      pairSimilarity(mk({ firmId: "c1" }), mk({ firmId: "c2" }), "firm-affiliation"),
    ).toBe(0);
    expect(
      pairSimilarity(mk({ firmId: null }), mk({ firmId: null }), "firm-affiliation"),
    ).toBe(0);
  });
});

describe("performance smoke", () => {
  it("500 users × 10 random roles, all 7 dims enabled → <500ms", () => {
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

    const strengths = new Map<SimilarityDim, number>(
      SIMILARITY_DIMS.map((d) => [d, 1] as const),
    );
    const start = performance.now();
    const result = topKNeighbors({ users }, strengths, 2, 20);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result.size).toBe(500);
  });
});
