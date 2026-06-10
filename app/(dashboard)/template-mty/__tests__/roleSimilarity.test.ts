import { describe, it, expect } from "vitest";
import { buildRoleSimilarityGraph } from "../roleSimilarity";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

function node(roleId: string, roleName: string, tiers: Array<{ rank: number; label: string; ids: string[] }>): RoleTreeNode {
  return {
    roleId, roleName,
    folderCount: tiers.reduce((s, t) => s + t.ids.length, 0),
    tiers: tiers.map((t) => ({ rank: t.rank, label: t.label, folders: t.ids.map((id) => ({ id, name: id, path: id })) })),
  };
}

describe("buildRoleSimilarityGraph", () => {
  const roles: RoleTreeNode[] = [
    node("r1", "R1", [{ rank: 1, label: "View only", ids: ["f1", "f2", "f3"] }]),
    node("r2", "R2", [{ rank: 1, label: "View only", ids: ["f1", "f2", "f3"] }]), // identical to r1
    node("r3", "R3", [{ rank: 5, label: "Full control", ids: ["f9"] }]),          // disjoint from r1/r2
  ];

  it("links roles with similar folder access and drops dissimilar ones", () => {
    const g = buildRoleSimilarityGraph(roles, { topK: 4, minWeight: 0.05 });

    // one node per role, carrying reach + peak tier
    expect(g.nodes.map((n) => [n.roleId, n.folderCount, n.maxRank])).toEqual([
      ["r1", 3, 1],
      ["r2", 3, 1],
      ["r3", 1, 5],
    ]);

    // identical roles → one undirected edge at full similarity; R3 shares nothing → no edge
    expect(g.edges).toEqual([{ source: "r1", target: "r2", weight: 1 }]);
  });

  it("returns no edges for a single role", () => {
    const g = buildRoleSimilarityGraph([roles[0]]);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toEqual([]);
  });
});
