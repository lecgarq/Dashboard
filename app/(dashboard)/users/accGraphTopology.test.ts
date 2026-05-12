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

  it("emits user-similarity edges with dimension + weight from similarityInput", () => {
    const similarityInput: SimilarityInput = {
      users: [
        { id: "user-a", company: null, adminTier: null, roleIds: ["r1", "r2"], projectIds: [], folderIds: [] },
        { id: "user-b", company: null, adminTier: null, roleIds: ["r1", "r2"], projectIds: [], folderIds: [] },
        { id: "user-c", company: null, adminTier: null, roleIds: ["r1", "r2"], projectIds: [], folderIds: [] },
      ],
    };
    const dims = new Set<SimilarityDim>(["roles"]);

    const graph = buildAccTopologyGraph(nodes, {
      similarityInput,
      similarityDims: dims,
      simMin: 2,
    });

    const simLinks = graph.links.filter((l) => l.kind === "user-similarity");
    // 3 users × 2 shared roles → 3 pairs (a-b, a-c, b-c), each weight=2.
    expect(simLinks).toHaveLength(3);
    for (const link of simLinks) {
      expect(link.dimension).toBe("roles");
      expect(link.weight).toBe(2);
    }
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
