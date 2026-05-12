import { describe, expect, it } from "vitest";

import { filterTopologyForGraphMode } from "./accGraphModes";
import type { AccTopologyGraph } from "./accGraphOrganicLayout";

function sampleTopology(): AccTopologyGraph {
  return {
    visibleNodes: [{ id: "alpha@example.com", index: 0 }],
    hiddenNodes: [
      { id: "hub:project:p1", kind: "project", label: "Project 1" },
      { id: "hub:role:r1", kind: "role", label: "Role 1" },
      { id: "hub:folder:f1", kind: "folder", label: "Folder 1" },
    ],
    links: [
      { source: "alpha@example.com", target: "hub:project:p1", kind: "project" },
      { source: "alpha@example.com", target: "hub:role:r1", kind: "role" },
      { source: "hub:role:r1", target: "hub:folder:f1", kind: "role-folder", permTier: "view" },
      { source: "alpha@example.com", target: "beta@example.com", kind: "user-similarity", dimension: "roles" },
    ],
  };
}

describe("filterTopologyForGraphMode", () => {
  it("defaults to users mode without folder hubs or role-folder edges", () => {
    const graph = filterTopologyForGraphMode(sampleTopology());

    expect(graph.hiddenNodes).toEqual([]);
    expect(graph.links).toEqual([
      { source: "alpha@example.com", target: "beta@example.com", kind: "user-similarity", dimension: "roles" },
    ]);
  });

  it("keeps access hubs without folder permission edges", () => {
    const graph = filterTopologyForGraphMode(sampleTopology(), "access-hubs");

    expect(graph.hiddenNodes.map((node) => node.kind)).toEqual(["project", "role"]);
    expect(graph.links.map((link) => link.kind)).toEqual(["project", "role"]);
  });

  it("keeps folder permission hubs and role-folder edges only in folder mode", () => {
    const graph = filterTopologyForGraphMode(sampleTopology(), "folder-permissions");

    expect(graph.hiddenNodes.map((node) => node.kind)).toEqual(["project", "role", "folder"]);
    expect(graph.links.map((link) => link.kind)).toEqual(["project", "role", "role-folder"]);
  });
});
