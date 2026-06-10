import crypto from "crypto";

type AccGraphNodeKind = "instance";

interface AccGraphBaseNode {
  kind: AccGraphNodeKind;
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface AccGraphInstanceNode extends AccGraphBaseNode {
  kind: "instance";
  email: string;
  name: string;
  projectId: string;
  projectName: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
  lastAddedBucket: string; // year-month bucket, e.g. "2023-08" or "" if unknown
  individualAccess: boolean; // roles.length > 0 || modules.length > 0
  companyRole: string | null;
  lastSignIn: string | null;
}

export type AccGraphNode = AccGraphInstanceNode;

interface AccGraphEdge {
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
  addedOn?: unknown; // string ISO date from AccMemberCache.data.addedOn
  companyRole?: unknown;
  lastSignIn?: unknown;
}

const SIM_WIDTH = 6000;
const SIM_HEIGHT = 6000;

const GRAPH_TOPOLOGY_VERSION = 3;

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

function getDisplayName(name: string, email: string): string {
  const trimmedName = name.trim();
  return trimmedName || email;
}

function getCategoryColor(key: string | null | undefined): string {
  if (!key) return "#9CA3AF";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return VIBRANT_COLORS[Math.abs(hash) % VIBRANT_COLORS.length];
}

function hash01(value: string, salt = ""): number {
  let hash = 2166136261;
  const input = `${salt}:${value}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function featureAnchor(value: string, salt: string): { x: number; y: number } {
  const angle = hash01(value, `${salt}:angle`) * Math.PI * 2;
  const radius = 0.24 + hash01(value, `${salt}:radius`) * 0.24;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function averageFeatureAnchor(values: readonly string[], salt: string): { x: number; y: number; weight: number } {
  if (!values.length) return { x: 0, y: 0, weight: 0 };
  let x = 0;
  let y = 0;
  for (const value of values) {
    const anchor = featureAnchor(value, salt);
    x += anchor.x;
    y += anchor.y;
  }
  return { x: x / values.length, y: y / values.length, weight: 1 };
}

function toDateBucket(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  const match = raw.match(/^(\d{4}-\d{2})/);
  return match ? match[1] : "";
}

function applySemanticNodePositions(nodes: AccGraphNode[]): void {
  const weights = { role: 72, access: 38, project: 68, lastAdded: 45, individualAccess: 42, userName: 30 };
  const maxWeight = weights.role + weights.access + weights.project + weights.lastAdded + weights.individualAccess + weights.userName;

  for (const node of nodes) {
    // node.kind is always "instance" now — no hub branch needed
    const project = featureAnchor(node.projectName || node.projectId || "no-project", "project");
    const roles = averageFeatureAnchor(node.roles, "role");
    const access = node.isAdmin
      ? { x: -0.42, y: -0.28 }
      : { x: 0.32, y: 0.22 };
    // lastAdded bucket as positional anchor
    const lastAddedAnchor = node.lastAddedBucket
      ? featureAnchor(node.lastAddedBucket, "lastAdded")
      : { x: 0, y: 0 };
    // individualAccess as a fixed directional bias
    const individualAccessAnchor = node.individualAccess
      ? { x: -0.18, y: 0.35 }
      : { x: 0.18, y: -0.35 };
    const userNameAnchor = node.name
      ? featureAnchor(node.name.toLowerCase(), "userName")
      : { x: 0, y: 0 };
    const jitter = featureAnchor(node.id, "instance");

    let x = project.x * weights.project + access.x * weights.access;
    let y = project.y * weights.project + access.y * weights.access;
    let usedWeight = weights.project + weights.access;

    if (roles.weight > 0) {
      x += roles.x * weights.role;
      y += roles.y * weights.role;
      usedWeight += weights.role;
    }
    if (node.lastAddedBucket) {
      x += lastAddedAnchor.x * weights.lastAdded;
      y += lastAddedAnchor.y * weights.lastAdded;
      usedWeight += weights.lastAdded;
    }
    x += individualAccessAnchor.x * weights.individualAccess;
    y += individualAccessAnchor.y * weights.individualAccess;
    usedWeight += weights.individualAccess;
    if (node.name) {
      x += userNameAnchor.x * weights.userName;
      y += userNameAnchor.y * weights.userName;
      usedWeight += weights.userName;
    }

    const normalizer = Math.max(1, Math.min(maxWeight, usedWeight));
    node.x = SIM_WIDTH * (0.5 + x / normalizer + jitter.x * 0.08);
    node.y = SIM_HEIGHT * (0.5 + y / normalizer + jitter.y * 0.08);
  }
}

function hashTopology(rows: AccMemberCacheRow[]): string {
  const shape = {
    version: GRAPH_TOPOLOGY_VERSION,
    rows: rows.map((row) => {
      const data = parseCachedUser(row.data);
      const projects = data.found === true
        ? readProjects(data.projects).map((project) => ({
            id: project.id,
            name: project.name,
            isAdmin: project.isAdmin === true,
            roles: toStringSet(project.roles),
            modules: toStringSet(project.modules),
          }))
        : [];
      return {
        email: row.email.toLowerCase(),
        found: data.found === true,
        name: typeof data.name === "string" ? data.name : "",
        addedOn: typeof data.addedOn === "string" ? data.addedOn : "",
        projects,
      };
    }),
  };
  return crypto.createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

export function buildAccGraphSnapshot(rows: AccMemberCacheRow[]): AccGraphSnapshot {
  const sortedRows = [...rows].sort((a, b) => a.email.localeCompare(b.email));
  const dataHash = hashTopology(sortedRows);

  const projectCounts = new Map<string, { name: string; count: number }>();
  const roleCounts = new Map<string, number>();
  const moduleCounts = new Map<string, number>();
  const foundUsers = new Set<string>();

  const parsed = sortedRows.map((row) => {
    const data = parseCachedUser(row.data);
    const email = row.email.toLowerCase();
    const name = typeof data.name === "string" ? data.name : "";
    const projects = data.found === true ? readProjects(data.projects) : [];
    const addedOn = typeof data.addedOn === "string" ? data.addedOn : "";
    const companyRole = typeof data.companyRole === "string" && data.companyRole ? data.companyRole : null;
    const lastSignIn = typeof data.lastSignIn === "string" && data.lastSignIn ? data.lastSignIn : null;
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

    return { email, name, projects, addedOn, companyRole, lastSignIn };
  });

  const nodes: AccGraphNode[] = [];
  const edges: AccGraphEdge[] = [];

  const totalInstances = parsed.reduce((sum, row) => sum + row.projects.length, 0);
  for (const user of parsed) {
    for (const project of user.projects) {
      const roles = toStringSet(project.roles);
      const modules = toStringSet(project.modules);
      const primaryRole = roles[0] ?? null;
      const color = getCategoryColor(primaryRole);
      const nodeId = `instance:${user.email}:${project.id}`;

      nodes.push({
        kind: "instance",
        id: nodeId,
        email: user.email,
        name: getDisplayName(user.name, user.email),
        label: getFirstName(user.name, user.email),
        projectId: project.id,
        projectName: project.name,
        isAdmin: project.isAdmin === true,
        roles,
        modules,
        lastAddedBucket: toDateBucket(user.addedOn),
        individualAccess: roles.length > 0 || modules.length > 0,
        companyRole: user.companyRole,
        lastSignIn: user.lastSignIn,
        color,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  }

  applySemanticNodePositions(nodes);

  const nodeIds = nodes.map((node) => node.id);
  const stats = {
    uniqueFoundUsers: foundUsers.size,
    uniqueProjects: projectCounts.size,
    totalProjectInstances: totalInstances,
    roleCount: roleCounts.size,
    moduleCount: moduleCounts.size,
    nodeCount: nodes.length,
    edgeCount: edges.length,
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
  const maxRange = Math.max(rangeX, rangeY);
  const offsetX = (maxRange - rangeX) / 2;
  const offsetY = (maxRange - rangeY) / 2;

  const positions: number[] = [];
  for (const node of nodes) {
    positions.push((node.x - minX + offsetX) / maxRange, (node.y - minY + offsetY) / maxRange);
  }
  return positions;
}
