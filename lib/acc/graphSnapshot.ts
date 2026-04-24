import crypto from "crypto";

export type AccGraphNodeKind = "instance";

export interface AccGraphBaseNode {
  kind: AccGraphNodeKind;
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface AccGraphInstanceNode extends AccGraphBaseNode {
  kind: "instance";
  email: string;
  name: string;
  projectId: string;
  projectName: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
}

export type AccGraphNode = AccGraphInstanceNode;

export interface AccGraphEdge {
  source: string;
  target: string;
  color: string;
  weight: number;
  kind: "project" | "role" | "module";
}

export interface AccGraphStats {
  uniqueFoundUsers: number;
  uniqueProjects: number;
  totalProjectInstances: number;
  roleCount: number;
  moduleCount: number;
  nodeCount: number;
  edgeCount: number;
}

export interface AccGraphSnapshot {
  nodes: AccGraphNode[];
  edges: AccGraphEdge[];
  nodeIds: string[];
  dataHash: string;
  stats: AccGraphStats;
}

interface AccMemberCacheRow {
  email: string;
  data: unknown;
}

interface CachedProject {
  id: string;
  name: string;
  status?: string;
  isAdmin?: boolean;
  roles?: unknown;
  modules?: unknown;
}

interface CachedUser {
  found?: unknown;
  name?: unknown;
  projects?: unknown;
}

const SIM_WIDTH = 6000;
const SIM_HEIGHT = 6000;

const GRAPH_TOPOLOGY_VERSION = 2;

const VIBRANT_COLORS = [
  "#E63946", "#F4A261", "#2A9D8F", "#264653", "#A8DADC",
  "#D62828", "#F77F00", "#FCBF49", "#003049", "#FF9F1C",
  "#2EC4B6", "#FFBF69", "#FF99C8", "#9B5DE5", "#F15BB5",
  "#FEE440", "#00BBF9", "#00F5D4", "#4361EE", "#3A0CA3",
  "#7209B7", "#560BAD", "#480CA8", "#B5179E", "#F72585",
  "#4CC9F0", "#8338EC", "#FF006E", "#FB5607", "#3D5A40",
];

function toStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function parseCachedUser(raw: unknown): CachedUser {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      data = null;
    }
  }
  return data && typeof data === "object" ? data as CachedUser : {};
}

function readProjects(rawProjects: unknown): CachedProject[] {
  if (!Array.isArray(rawProjects)) return [];
  return rawProjects
    .filter((project): project is Record<string, unknown> => !!project && typeof project === "object")
    .map((project) => ({
      id: typeof project.id === "string" ? project.id : "",
      name: typeof project.name === "string" ? project.name : "Untitled project",
      status: typeof project.status === "string" ? project.status : undefined,
      isAdmin: project.isAdmin === true,
      roles: toStringSet(project.roles),
      modules: toStringSet(project.modules),
    }))
    .filter((project) => project.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function truncate(str: string, n: number): string {
  return str.length > n ? `${str.slice(0, n - 3)}...` : str;
}

function getFirstName(name: string, email: string): string {
  if (name.trim()) return name.split(" ")[0].slice(0, 10);
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function getCategoryColor(key: string | null | undefined): string {
  if (!key) return "#9CA3AF";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return VIBRANT_COLORS[Math.abs(hash) % VIBRANT_COLORS.length];
}

function hashTopology(rows: AccMemberCacheRow[]): string {
  const shape = {
    version: GRAPH_TOPOLOGY_VERSION,
    rows: rows.map((row) => {
      const data = parseCachedUser(row.data);
      const projects = data.found === true
        ? readProjects(data.projects).map((project) => ({
            id: project.id,
            roles: toStringSet(project.roles),
            modules: toStringSet(project.modules),
          }))
        : [];
      return {
        email: row.email.toLowerCase(),
        found: data.found === true,
        projects,
      };
    }),
  };
  return crypto.createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

export function buildAccGraphSnapshot(rows: AccMemberCacheRow[]): AccGraphSnapshot {
  const sortedRows = [...rows].sort((a, b) => a.email.localeCompare(b.email));
  const dataHash = hashTopology(sortedRows);
  const cx = SIM_WIDTH / 2;
  const cy = SIM_HEIGHT / 2;

  const projectCounts = new Map<string, { name: string; count: number }>();
  const roleCounts = new Map<string, number>();
  const moduleCounts = new Map<string, number>();
  const foundUsers = new Set<string>();

  const parsed = sortedRows.map((row) => {
    const data = parseCachedUser(row.data);
    const email = row.email.toLowerCase();
    const name = typeof data.name === "string" ? data.name : "";
    const projects = data.found === true ? readProjects(data.projects) : [];
    if (data.found === true) foundUsers.add(email);

    for (const project of projects) {
      const projectEntry = projectCounts.get(project.id) ?? { name: project.name, count: 0 };
      projectEntry.count++;
      projectCounts.set(project.id, projectEntry);
      for (const role of toStringSet(project.roles)) roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      for (const moduleName of toStringSet(project.modules)) {
        moduleCounts.set(moduleName, (moduleCounts.get(moduleName) ?? 0) + 1);
      }
    }

    return { email, name, projects };
  });

  const nodes: AccGraphNode[] = [];
  const edges: AccGraphEdge[] = [];

  let instanceIndex = 0;
  const totalInstances = parsed.reduce((sum, row) => sum + row.projects.length, 0);
  for (const user of parsed) {
    for (const project of user.projects) {
      const roles = toStringSet(project.roles);
      const modules = toStringSet(project.modules);
      const primaryRole = roles[0] ?? null;
      const color = project.isAdmin ? "#10B981" : getCategoryColor(primaryRole);
      const angle = (instanceIndex / Math.max(1, totalInstances)) * Math.PI * 2;
      const radius = SIM_WIDTH * 0.11 + ((instanceIndex % 17) - 8) * 18;
      const nodeId = `instance:${user.email}:${project.id}`;

      nodes.push({
        kind: "instance",
        id: nodeId,
        email: user.email,
        name: getFirstName(user.name, user.email),
        label: getFirstName(user.name, user.email),
        projectId: project.id,
        projectName: project.name,
        isAdmin: project.isAdmin === true,
        roles,
        modules,
        color,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius + (project.isAdmin ? -SIM_HEIGHT * 0.04 : 0),
        vx: 0,
        vy: 0,
      });

      instanceIndex++;
    }
  }

  const nodeIds = nodes.map((node) => node.id);
  const stats = {
    uniqueFoundUsers: foundUsers.size,
    uniqueProjects: projectCounts.size,
    totalProjectInstances: totalInstances,
    roleCount: roleCounts.size,
    moduleCount: moduleCounts.size,
    nodeCount: totalInstances,
    edgeCount: 0,
  };

  return { nodes, edges, nodeIds, dataHash, stats };
}

export function normalizeAccGraphPositions(nodes: readonly Pick<AccGraphNode, "x" | "y">[]): number[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const positions: number[] = [];
  for (const node of nodes) {
    positions.push((node.x - minX) / rangeX, (node.y - minY) / rangeY);
  }
  return positions;
}
