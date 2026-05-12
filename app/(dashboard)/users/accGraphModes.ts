import type { AccTopologyGraph, AccTopologyLinkKind } from "./accGraphOrganicLayout";

export type AccGraphMode = "users" | "access-hubs" | "folder-permissions";

export const DEFAULT_ACC_GRAPH_MODE: AccGraphMode = "users";

export const ACC_GRAPH_MODE_STORAGE_KEY = "acc-graph-mode";

const MODE_LINK_KINDS: Record<AccGraphMode, ReadonlySet<AccTopologyLinkKind>> = {
  users: new Set(["user-similarity"]),
  "access-hubs": new Set(["project", "role", "module", "access"]),
  "folder-permissions": new Set([
    "project",
    "role",
    "module",
    "access",
    "folder-project",
    "role-folder",
  ]),
};

const MODE_HUB_KINDS: Record<AccGraphMode, ReadonlySet<string>> = {
  users: new Set(),
  "access-hubs": new Set(["project", "role", "module", "access"]),
  "folder-permissions": new Set(["project", "role", "module", "access", "folder"]),
};

export function isAccGraphMode(value: string | null | undefined): value is AccGraphMode {
  return value === "users" || value === "access-hubs" || value === "folder-permissions";
}

export function filterTopologyForGraphMode(
  topology: AccTopologyGraph,
  mode: AccGraphMode = DEFAULT_ACC_GRAPH_MODE,
): AccTopologyGraph {
  const allowedLinks = MODE_LINK_KINDS[mode];
  const allowedHubs = MODE_HUB_KINDS[mode];
  return {
    visibleNodes: topology.visibleNodes,
    hiddenNodes: topology.hiddenNodes.filter((node) => allowedHubs.has(node.kind)),
    links: topology.links.filter((link) => allowedLinks.has(link.kind)),
  };
}
