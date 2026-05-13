import { describe, expect, it } from "vitest";

import type { OrganicLayoutNode } from "./accGraphOrganicLayout";
import { buildAccTopologyGraph, collapsePermTierKey } from "./accGraphOrganicLayout";
import type { FolderHubInputRow } from "@/lib/acc/folderHubCollapse";
import type { SimilarityDim, SimilarityInput } from "@/lib/acc/userSimilarity";

const nodes = [
  {
    id: "instance:b@example.com:project-2",
    email: "b@example.com",
    name: "Beta User",
    projectId: "project-2",
    projectName: "Project Two",
    isAdmin: false,
    roles: ["Modeler"],
    lastAddedBucket: "2026-04",
    modules: ["docs"],
  },
  {
    id: "instance:a@example.com:project-1",
    email: "a@example.com",
    name: "Alpha User",
    projectId: "project-1",
    projectName: "Project One",
    isAdmin: true,
    roles: ["Architect", "Reviewer"],
    lastAddedBucket: "2026-03",
    modules: ["docs", "build"],
  },
] satisfies OrganicLayoutNode[];

describe("buildAccTopologyGraph", () => {
  it("preserves visible node order", () => {
    expect(typeof buildAccTopologyGraph).toBe("function");

    const graph = buildAccTopologyGraph(nodes);

    expect(graph.visibleNodes.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
  });

  it("creates deterministic hidden hubs", () => {
    expect(typeof buildAccTopologyGraph).toBe("function");

    const first = buildAccTopologyGraph(nodes);
    const second = buildAccTopologyGraph([...nodes].reverse());

    expect(first.hiddenNodes.map((node) => node.id)).toEqual(second.hiddenNodes.map((node) => node.id));
    expect(first.hiddenNodes.map((node) => node.id)).toEqual([
      "hub:access:admin",
      "hub:access:member",
      "hub:module:build",
      "hub:module:docs",
      "hub:project:project-1",
      "hub:project:project-2",
      "hub:role:architect",
      "hub:role:modeler",
      "hub:role:reviewer",
      "hub:user:a%40example.com",
      "hub:user:b%40example.com",
    ]);
  });

  it("links nodes through real ACC relationships only", () => {
    expect(typeof buildAccTopologyGraph).toBe("function");

    const graph = buildAccTopologyGraph(nodes);
    const sourceA = "instance:a@example.com:project-1";
    const linkKeys = new Set(graph.links.map((link) => `${link.source}->${link.target}:${link.kind}`));

    expect(linkKeys.has(`${sourceA}->hub:project:project-1:project`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:role:architect:role`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:role:reviewer:role`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:module:docs:module`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:module:build:module`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:access:admin:access`)).toBe(true);
    expect(linkKeys.has(`${sourceA}->hub:user:a%40example.com:user`)).toBe(true);
    expect(graph.links.some((link) => String(link.kind) === "semantic")).toBe(false);
    expect(graph.links.some((link) => String(link.kind) === "lastAdded")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 topology extensions — folder hubs + similarity edges
// Plan 07-05 (GRAPH7-01, GRAPH7-02, GRAPH7-03, GRAPH7-04, GRAPH7-11)
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 7 topology extensions", () => {
  it("emits folder hubs + folder-project + role-folder edges from folderMatrix", () => {
    const folderMatrix: FolderHubInputRow[] = [
      // 3 descendant rows under one project, all collapse to depth-2 hub.
      { folderId: "f1", folderPath: "/Project Files/Architecture/Plans", projectId: "project-1", roleId: "role-a", permType: "View+Download" },
      { folderId: "f2", folderPath: "/Project Files/Architecture/Sections", projectId: "project-1", roleId: "role-a", permType: "View+Download" },
      { folderId: "f3", folderPath: "/Project Files/Architecture/Elevations", projectId: "project-1", roleId: "role-b", permType: "Full Controller" },
    ];

    const graph = buildAccTopologyGraph(nodes, { folderMatrix });

    const folderHubs = graph.hiddenNodes.filter((h) => h.kind === "folder");
    expect(folderHubs).toHaveLength(1);
    expect(folderHubs[0].label).toBe("Architecture");

    const folderProjectLinks = graph.links.filter((l) => l.kind === "folder-project");
    expect(folderProjectLinks).toHaveLength(1);
    expect(folderProjectLinks[0].source).toBe(folderHubs[0].id);

    const roleFolderLinks = graph.links.filter((l) => l.kind === "role-folder");
    // role-a (view) + role-b (control) — both deduped to single edge per role.
    expect(roleFolderLinks).toHaveLength(2);
    const tiers = roleFolderLinks.map((l) => l.permTier).sort();
    expect(tiers).toEqual(["control", "view"]);
  });

  it("emits NO folder hubs when folderMatrix is undefined (regression guard)", () => {
    const graph = buildAccTopologyGraph(nodes);
    expect(graph.hiddenNodes.some((h) => h.kind === "folder")).toBe(false);
    expect(graph.links.some((l) => l.kind === "folder-project" || l.kind === "role-folder")).toBe(false);
  });

  it("emits user-similarity force links via topKNeighbors driven by simStr", () => {
    const baseUser = {
      activityFileIds: [] as readonly string[],
      coverageFlags: [] as readonly string[],
      lastSignIn: null as number | null,
      addedAt: null as number | null,
      projectIds: [] as readonly string[],
      folderIds: [] as readonly string[],
    };
    const similarityInput: SimilarityInput = {
      users: [
        { id: "user-a", roleIds: ["r1", "r2"], ...baseUser },
        { id: "user-b", roleIds: ["r1", "r2"], ...baseUser },
        { id: "user-c", roleIds: ["r1", "r2"], ...baseUser },
      ],
    };
    const simStr = new Map<SimilarityDim, number>([["roles", 1]]);

    const graph = buildAccTopologyGraph(nodes, {
      similarityInput,
      simStr,
      simMin: 1,
      topK: 20,
    });

    const simLinks = graph.links.filter((l) => l.kind === "user-similarity");
    // 3 users, all pairwise similar → 3 undirected pairs (a-b, a-c, b-c).
    // topKNeighbors returns directed lists; the layout canonicalizes to one
    // edge per pair. force = simStr[roles] * pairSimilarity = 1 * 1 = 1.0.
    expect(simLinks).toHaveLength(3);
    for (const link of simLinks) {
      expect(link.dimension).toBe("roles");
      expect(link.weight).toBeCloseTo(1.0, 5);
    }
  });

  it("emits NO user-similarity links when simStr is undefined", () => {
    const baseUser = {
      activityFileIds: [] as readonly string[],
      coverageFlags: [] as readonly string[],
      lastSignIn: null as number | null,
      addedAt: null as number | null,
      projectIds: [] as readonly string[],
      folderIds: [] as readonly string[],
    };
    const similarityInput: SimilarityInput = {
      users: [
        { id: "user-a", roleIds: ["r1"], ...baseUser },
        { id: "user-b", roleIds: ["r1"], ...baseUser },
      ],
    };

    const graph = buildAccTopologyGraph(nodes, { similarityInput });
    expect(graph.links.filter((l) => l.kind === "user-similarity")).toHaveLength(0);
  });

  it("emits NO user-similarity links when simStr is all-zero", () => {
    const baseUser = {
      activityFileIds: [] as readonly string[],
      coverageFlags: [] as readonly string[],
      lastSignIn: null as number | null,
      addedAt: null as number | null,
      projectIds: [] as readonly string[],
      folderIds: [] as readonly string[],
    };
    const similarityInput: SimilarityInput = {
      users: [
        { id: "user-a", roleIds: ["r1"], ...baseUser },
        { id: "user-b", roleIds: ["r1"], ...baseUser },
      ],
    };
    const simStr = new Map<SimilarityDim, number>([["roles", 0]]);

    const graph = buildAccTopologyGraph(nodes, { similarityInput, simStr });
    expect(graph.links.filter((l) => l.kind === "user-similarity")).toHaveLength(0);
  });

  it("caps user-similarity links per user via topK", () => {
    const baseUser = {
      activityFileIds: [] as readonly string[],
      coverageFlags: [] as readonly string[],
      lastSignIn: null as number | null,
      addedAt: null as number | null,
      projectIds: [] as readonly string[],
      folderIds: [] as readonly string[],
    };
    // 5 users all pairwise similar → 10 undirected pairs at unlimited K.
    // With topK=1 each user keeps only its top neighbor; canonicalization
    // dedupes reciprocals so the resulting pair count is at most 5 (and
    // typically lower as ties resolve to a smaller spanning set).
    const similarityInput: SimilarityInput = {
      users: ["a", "b", "c", "d", "e"].map((id) => ({
        id,
        roleIds: ["r1"],
        ...baseUser,
      })),
    };
    const simStr = new Map<SimilarityDim, number>([["roles", 1]]);

    const fullGraph = buildAccTopologyGraph(nodes, {
      similarityInput,
      simStr,
      simMin: 1,
      topK: 20,
    });
    const cappedGraph = buildAccTopologyGraph(nodes, {
      similarityInput,
      simStr,
      simMin: 1,
      topK: 1,
    });

    const fullSim = fullGraph.links.filter((l) => l.kind === "user-similarity");
    const cappedSim = cappedGraph.links.filter((l) => l.kind === "user-similarity");
    expect(fullSim).toHaveLength(10); // C(5,2)
    expect(cappedSim.length).toBeLessThanOrEqual(5);
    expect(cappedSim.length).toBeLessThan(fullSim.length);
  });

  it("collapsePermTierKey maps 6-tier APS PermType -> 4-tier UI bucket", () => {
    expect(collapsePermTierKey("View Only")).toBe("view");
    expect(collapsePermTierKey("View+Download")).toBe("view");
    expect(collapsePermTierKey("Upload Only")).toBe("upload");
    expect(collapsePermTierKey("View+Download+Upload")).toBe("upload");
    expect(collapsePermTierKey("View+Download+Upload+Edit")).toBe("edit");
    expect(collapsePermTierKey("Full Controller")).toBe("control");
    // Unknown defaults to least privilege.
    expect(collapsePermTierKey("Some Unknown Tier")).toBe("view");
  });

  it("emits NO user-similarity edges when similarityInput is null (regression guard)", () => {
    const graph = buildAccTopologyGraph(nodes, {
      similarityInput: null,
      similarityDims: new Set<SimilarityDim>(["roles"]),
    });
    expect(graph.links.some((l) => l.kind === "user-similarity")).toBe(false);
  });
});
