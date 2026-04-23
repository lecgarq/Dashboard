"use client";

import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { type BulkAccUser, type BulkAccProject } from "./AccAnalysisPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One dot per user × project. Positions cluster by role + module similarity. */
interface InstanceNode {
  kind: "instance";
  id: string; // `${email}::${projectId}`
  email: string;
  name: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Single dot for found-but-no-project or unfound users. */
interface UserNode {
  kind: "user";
  id: string;
  email: string;
  name: string;
  found: boolean;
  hasNoProjects: boolean;
  allRoles: string[];
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Diamond hub attracting instances that share a role. */
interface RoleNode {
  kind: "role";
  id: string;
  label: string;
  roleName: string;
  instanceCount: number;
  radius: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Square hub attracting instances that share a module. */
interface ModuleNode {
  kind: "module";
  id: string;
  label: string;
  moduleName: string;
  instanceCount: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type SimNode = InstanceNode | UserNode | RoleNode | ModuleNode;

interface Edge {
  source: string;
  target: string;
  color: string;
  weight: number; // 1.0 = role edge, 0.45 = module edge
}

interface SidePanelState {
  node: SimNode;
  roleUsers?: string[];
  moduleInstances?: string[];
  userProjectCount?: number;
}

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const VIBRANT_COLORS: string[] = [
  "#E63946", "#F4A261", "#2A9D8F", "#264653", "#A8DADC",
  "#D62828", "#F77F00", "#FCBF49", "#003049", "#FF9F1C",
  "#2EC4B6", "#FFBF69", "#FF99C8", "#9B5DE5", "#F15BB5",
  "#FEE440", "#00BBF9", "#00F5D4", "#4361EE", "#3A0CA3",
  "#7209B7", "#560BAD", "#480CA8", "#B5179E", "#F72585",
  "#4CC9F0", "#8338EC", "#FF006E", "#FB5607", "#3D5A40",
];

const colorCache = new Map<string, string>();
function getCategoryColor(key: string | null | undefined): string {
  if (!key) return "#9CA3AF";
  const c = colorCache.get(key);
  if (c) return c;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const color = VIBRANT_COLORS[Math.abs(hash) % VIBRANT_COLORS.length];
  colorCache.set(key, color);
  return color;
}

function getInstanceColor(proj: BulkAccProject): string {
  if (proj.isAdmin) return "#10B981"; // emerald — admin in this project
  const primaryRole = [...proj.roles].sort()[0] ?? null;
  return getCategoryColor(primaryRole);
}

const ROLE_HUB_COLOR = "#7C3AED";
const MODULE_HUB_COLOR = "#0EA5E9";
const EDGE_ALPHA = 0.10;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIM_ITERATIONS = 130;
const REPULSION = 2200;
const ATTRACTION = 0.07;
const DAMPING = 0.72;
const CENTER_GRAVITY = 0.022;
const SIM_WIDTH = 6000;
const SIM_HEIGHT = 6000;
const REPULSION_GRID = 450; // spatial grid cell size for repulsion

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<string, string> = {
  documentManagement: "Data Mgmt",
  designCollaboration: "Design Collab",
  modelCoordination: "Model Coord",
  preconstruction: "Preconstruction",
  autoSpecs: "AutoSpecs",
  build: "Forma Build",
  insight: "Insight",
  design: "Design",
  takeoff: "Forma Takeoff",
  estimate: "Forma Estimate",
};
function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

function getFirstName(name: string, email: string): string {
  if (name?.trim()) return name.split(" ")[0].slice(0, 10);
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// ---------------------------------------------------------------------------
// Sprite
// ---------------------------------------------------------------------------

function createCircleSprite(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const d = size * 2;
  canvas.width = d; canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size, size, size, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// ---------------------------------------------------------------------------
// Build graph — one InstanceNode per found user × project
// ---------------------------------------------------------------------------

function buildGraph(users: BulkAccUser[]): { nodes: SimNode[]; edges: Edge[] } {
  const cx = SIM_WIDTH / 2, cy = SIM_HEIGHT / 2;

  const roleFreq = new Map<string, number>();
  const moduleFreq = new Map<string, number>();

  const instanceNodes: InstanceNode[] = [];
  const unfoundNodes: UserNode[] = [];

  // Pass 1: collect all found users with projects
  for (const u of users) {
    if (!u.found || u.projects.length === 0) {
      unfoundNodes.push({
        kind: "user",
        id: u.email,
        email: u.email,
        name: u.name,
        found: u.found,
        hasNoProjects: u.hasNoProjects,
        allRoles: u.allRoles,
        color: u.found ? "#F59E0B" : "#9CA3AF",
        x: cx + (Math.random() - 0.5) * SIM_WIDTH * 0.55,
        y: cy + (Math.random() - 0.5) * SIM_HEIGHT * 0.55,
        vx: 0, vy: 0,
      });
      continue;
    }
    for (const proj of u.projects) {
      for (const r of proj.roles) roleFreq.set(r, (roleFreq.get(r) ?? 0) + 1);
      for (const m of proj.modules) moduleFreq.set(m, (moduleFreq.get(m) ?? 0) + 1);
    }
  }

  // Pass 2: build instance nodes with initial positions
  const totalInstances = users.reduce((s, u) => s + u.projects.length, 0);
  let instanceIdx = 0;
  for (const u of users) {
    if (!u.found || u.projects.length === 0) continue;
    for (const proj of u.projects) {
      // Spread instances around an inner ring, with jitter
      const angle = (instanceIdx / Math.max(1, totalInstances)) * Math.PI * 2;
      const r = SIM_WIDTH * 0.12 + (Math.random() * 500 - 250);
      // Admin instances seeded in top half so they separate naturally
      const yBias = proj.isAdmin ? -SIM_HEIGHT * 0.06 : 0;
      instanceNodes.push({
        kind: "instance",
        id: `${u.email}::${proj.id}`,
        email: u.email,
        name: u.name,
        projectId: proj.id,
        projectName: proj.name,
        projectStatus: proj.status,
        isAdmin: proj.isAdmin,
        roles: proj.roles,
        modules: proj.modules,
        color: getInstanceColor(proj),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r + yBias,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
      });
      instanceIdx++;
    }
  }

  // Role hub nodes — outer ring
  const maxRoleFreq = Math.max(1, ...roleFreq.values());
  const roleNodes = new Map<string, RoleNode>();
  const roleList = [...roleFreq.keys()];
  roleList.forEach((role, ri) => {
    const count = roleFreq.get(role)!;
    const angle = (ri / roleList.length) * Math.PI * 2;
    const spread = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.34;
    roleNodes.set(role, {
      kind: "role",
      id: `role:${role}`,
      label: truncate(role, 12),
      roleName: role,
      instanceCount: count,
      radius: 9 + (count / maxRoleFreq) * 7,
      color: ROLE_HUB_COLOR,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0, vy: 0,
    });
  });

  // Module hub nodes — middle ring, offset by half step
  const maxModFreq = Math.max(1, ...moduleFreq.values());
  const moduleNodes = new Map<string, ModuleNode>();
  const modList = [...moduleFreq.keys()];
  modList.forEach((mod, mi) => {
    const angle = (mi / modList.length) * Math.PI * 2 + Math.PI / modList.length;
    const spread = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.20;
    moduleNodes.set(mod, {
      kind: "module",
      id: `module:${mod}`,
      label: truncate(moduleLabel(mod), 10),
      moduleName: mod,
      instanceCount: moduleFreq.get(mod)!,
      color: MODULE_HUB_COLOR,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0, vy: 0,
    });
  });

  const nodes: SimNode[] = [
    ...instanceNodes,
    ...unfoundNodes,
    ...roleNodes.values(),
    ...moduleNodes.values(),
  ];

  // Edges: instances → role hubs (weight 1.0) + module hubs (weight 0.45)
  const edges: Edge[] = [];
  for (const inst of instanceNodes) {
    for (const role of inst.roles) {
      const rn = roleNodes.get(role);
      if (rn) edges.push({ source: inst.id, target: rn.id, color: inst.color, weight: 1.0 });
    }
    for (const mod of inst.modules) {
      const mn = moduleNodes.get(mod);
      if (mn) edges.push({ source: inst.id, target: mn.id, color: mn.color, weight: 0.45 });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Simulation — grid-based O(n×k) repulsion, weighted edges
// ---------------------------------------------------------------------------

function runSimulation(nodes: SimNode[], edges: Edge[]): SimNode[] {
  const ns: SimNode[] = nodes.map((n) => ({ ...n }));
  const cx = SIM_WIDTH / 2, cy = SIM_HEIGHT / 2;
  const idxMap = new Map(ns.map((n, i) => [n.id, i]));

  // Hub nodes barely move — they anchor the clusters
  const isHub = (n: SimNode) => n.kind === "role" || n.kind === "module";

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const fx = new Float64Array(ns.length);
    const fy = new Float64Array(ns.length);

    // Grid-based repulsion: only between nodes in nearby cells
    const grid = new Map<string, number[]>();
    for (let i = 0; i < ns.length; i++) {
      const gx = Math.floor(ns[i].x / REPULSION_GRID);
      const gy = Math.floor(ns[i].y / REPULSION_GRID);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(i);
    }

    for (let i = 0; i < ns.length; i++) {
      const gx = Math.floor(ns[i].x / REPULSION_GRID);
      const gy = Math.floor(ns[i].y / REPULSION_GRID);
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const cell = grid.get(`${gx + ox},${gy + oy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const dx = ns[j].x - ns[i].x || 0.01;
            const dy = ns[j].y - ns[i].y || 0.01;
            const dist2 = dx * dx + dy * dy;
            const dist = Math.sqrt(dist2) || 0.01;
            const force = REPULSION / dist2;
            const fx_ = (dx / dist) * force, fy_ = (dy / dist) * force;
            fx[i] -= fx_; fy[i] -= fy_;
            fx[j] += fx_; fy[j] += fy_;
          }
        }
      }
    }

    // Attraction along edges with per-edge weight
    for (const e of edges) {
      const si = idxMap.get(e.source) ?? -1;
      const ti = idxMap.get(e.target) ?? -1;
      if (si < 0 || ti < 0) continue;
      const dx = ns[ti].x - ns[si].x, dy = ns[ti].y - ns[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = dist * ATTRACTION * e.weight;
      const fx_ = (dx / dist) * f, fy_ = (dy / dist) * f;
      fx[si] += fx_; fy[si] += fy_;
      // Hubs receive minimal force so they stay roughly anchored
      if (!isHub(ns[ti])) { fx[ti] -= fx_; fy[ti] -= fy_; }
      else { fx[ti] -= fx_ * 0.04; fy[ti] -= fy_ * 0.04; }
    }

    // Weak center gravity
    for (let i = 0; i < ns.length; i++) {
      fx[i] += (cx - ns[i].x) * CENTER_GRAVITY;
      fy[i] += (cy - ns[i].y) * CENTER_GRAVITY;
    }

    // Integrate
    for (let i = 0; i < ns.length; i++) {
      ns[i].vx = (ns[i].vx + fx[i]) * DAMPING;
      ns[i].vy = (ns[i].vy + fy[i]) * DAMPING;
      ns[i].x += ns[i].vx;
      ns[i].y += ns[i].vy;
    }
  }

  return ns;
}

// ---------------------------------------------------------------------------
// Normalize positions
// ---------------------------------------------------------------------------

function normalizePositions(settled: SimNode[]): Float32Array {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of settled) {
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
  }
  const rx = maxX - minX || 1, ry = maxY - minY || 1;
  const pos = new Float32Array(settled.length * 2);
  for (let i = 0; i < settled.length; i++) {
    pos[i * 2] = (settled[i].x - minX) / rx;
    pos[i * 2 + 1] = (settled[i].y - minY) / ry;
  }
  return pos;
}

// ---------------------------------------------------------------------------
// Spatial grid for O(1) hit testing
// ---------------------------------------------------------------------------

interface SpatialGrid { size: number; cells: Map<string, number[]>; }

function buildGrid(pos: Float32Array, count: number, cellSize: number): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.floor(pos[i * 2] / cellSize)},${Math.floor(pos[i * 2 + 1] / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(i);
  }
  return { size: cellSize, cells };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AccUsersGraph({ users, onSelectUser }: AccUsersGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const posRef = useRef<Float32Array>(new Float32Array(0));
  const gridRef = useRef<SpatialGrid>({ size: 0.05, cells: new Map() });
  const spritesRef = useRef(new Map<string, HTMLCanvasElement>());
  const nodeIndexMapRef = useRef(new Map<string, number>());

  const view = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const targetView = useRef({ x: 0.5, y: 0.5, scale: 600 });

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });

  const showRolesRef = useRef(true);
  const showModulesRef = useRef(true);

  const [showRoles, setShowRoles] = useState(true);
  const [showModules, setShowModules] = useState(true);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const selectedNodeRef = useRef<SidePanelState | null>(null);
  const [simulationDone, setSimulationDone] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Cache integration state
  const [refreshKey, setRefreshKey] = useState(0);
  const isRefreshingRef = useRef(false);

  // Map: role name → list of user display names (for role side panel)
  const roleUserMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of users) {
      if (!u.found) continue;
      for (const proj of u.projects) {
        for (const role of proj.roles) {
          const list = m.get(role) ?? [];
          list.push(u.name || u.email);
          m.set(role, list);
        }
      }
    }
    return m;
  }, [users]);

  // Map: email → number of project instances
  const emailInstanceCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) {
      if (u.found && u.projects.length > 0) m.set(u.email, u.projects.length);
    }
    return m;
  }, [users]);

  // Cache tRPC hooks
  const layoutQuery = trpc.users.getGraphLayout.useQuery(undefined, {
    enabled: users.length > 0,
    staleTime: Infinity, // never auto-refetch — invalidation is explicit via refreshKey
    retry: false, // if it fails, fall through to simulation
  });

  const saveLayout = trpc.users.saveGraphLayout.useMutation();
  const invalidateLayout = trpc.users.invalidateGraphLayout.useMutation();

  // Build + run simulation (with cache integration)
  useEffect(() => {
    if (!users.length) return;
    // Don't start a new run while a refresh is already in progress
    if (isRefreshingRef.current) return;

    setSimulationDone(false);
    setIsReady(false);

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users);
    edgesRef.current = rawEdges;

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      // --- Cache hit path ---
      const layout = layoutQuery.data;
      if (
        !cancelled &&
        layout?.hit &&
        layout.positions &&
        layout.nodeCount === rawNodes.length
      ) {
        // Apply cached positions directly — skip simulation entirely
        posRef.current = new Float32Array(layout.positions as number[]);
        nodesRef.current = rawNodes; // rawNodes already have correct order (same users input)

        const nim = new Map<string, number>();
        rawNodes.forEach((n, i) => nim.set(n.id, i));
        nodeIndexMapRef.current = nim;

        const cellSize = Math.max(0.01, 60 / view.current.scale);
        gridRef.current = buildGrid(posRef.current, rawNodes.length, cellSize);

        const colorSet = new Set(rawNodes.map((n) => n.color));
        colorSet.forEach((color) => {
          if (!spritesRef.current.has(color)) {
            spritesRef.current.set(color, createCircleSprite(color, 8));
          }
        });

        setSimulationDone(true);
        requestAnimationFrame(() => {
          zoomToFit();
          requestAnimationFrame(() => setIsReady(true));
        });
        return;
      }

      // --- Cache miss path — run simulation ---
      if (cancelled) return;
      const settled = runSimulation(rawNodes, rawEdges);
      if (cancelled) return;

      nodesRef.current = settled;
      posRef.current = normalizePositions(settled);

      const nim = new Map<string, number>();
      settled.forEach((n, i) => nim.set(n.id, i));
      nodeIndexMapRef.current = nim;

      const cellSize = Math.max(0.01, 60 / view.current.scale);
      gridRef.current = buildGrid(posRef.current, settled.length, cellSize);

      const colorSet = new Set(settled.map((n) => n.color));
      colorSet.forEach((color) => {
        if (!spritesRef.current.has(color)) {
          spritesRef.current.set(color, createCircleSprite(color, 8));
        }
      });

      setSimulationDone(true);
      requestAnimationFrame(() => {
        zoomToFit();
        requestAnimationFrame(() => {
          if (!cancelled) setIsReady(true);
        });
      });

      // Silent background save — fire and forget
      if (!cancelled && layout?.dataHash) {
        saveLayout.mutate(
          {
            positions: Array.from(posRef.current),
            dataHash: layout.dataHash,
            nodeCount: settled.length,
          },
          { onError: () => { /* silent failure — next load re-runs simulation */ } }
        );
      }

      isRefreshingRef.current = false;
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, layoutQuery.data, refreshKey]);

  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !posRef.current.length) return;
    const pos = posRef.current;
    const nodes = nodesRef.current;
    if (!nodes.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.kind === "role" && !showRolesRef.current) continue;
      if (n.kind === "module" && !showModulesRef.current) continue;
      const nx = pos[i * 2], ny = pos[i * 2 + 1];
      if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
    }
    if (minX === Infinity) return;

    const dw = maxX - minX || 0.01, dh = maxY - minY || 0.01;
    const cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
    const fitScale = Math.min(cw / dw, ch / dh) * 0.80;

    targetView.current = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(50, Math.min(500000, fitScale)),
    };
  }, []);

  const hitTest = useCallback((sx: number, sy: number): SimNode | null => {
    const canvas = canvasRef.current;
    if (!canvas || !posRef.current.length) return null;
    const v = view.current;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const wx = v.x + (sx - w / 2) / v.scale;
    const wy = v.y + (sy - h / 2) / v.scale;
    const g = gridRef.current;
    if (!g.cells.size) return null;
    const nodes = nodesRef.current, pos = posRef.current;
    const gx = Math.floor(wx / g.size), gy = Math.floor(wy / g.size);
    let bestDist = 15 / v.scale, bestIdx = -1;
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cell = g.cells.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;
        for (const idx of cell) {
          const n = nodes[idx];
          if (n.kind === "role" && !showRolesRef.current) continue;
          if (n.kind === "module" && !showModulesRef.current) continue;
          const dx = pos[idx * 2] - wx, dy = pos[idx * 2 + 1] - wy;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        }
      }
    }
    return bestIdx >= 0 ? nodes[bestIdx] : null;
  }, []);

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const render = () => {
      rafId.current = requestAnimationFrame(render);

      const v = view.current, tv = targetView.current;
      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const wantW = Math.floor(w * dpr), wantH = Math.floor(h * dpr);
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW; canvas.height = wantH;
      }

      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#F8F7F4";
      ctx.fillRect(0, 0, w, h);

      const nodes = nodesRef.current, pos = posRef.current;
      if (!nodes.length || !pos.length) return;

      ctx.translate(w / 2, h / 2);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.x, -v.y);

      const isInteracting = isDragging.current;
      const pad = 50 / v.scale;
      const minWX = v.x - (w / 2) / v.scale - pad, maxWX = v.x + (w / 2) / v.scale + pad;
      const minWY = v.y - (h / 2) / v.scale - pad, maxWY = v.y + (h / 2) / v.scale + pad;

      const selId = selectedNodeRef.current?.node.id ?? null;
      const nim = nodeIndexMapRef.current;
      const selIdx = selId ? (nim.get(selId) ?? -1) : -1;
      const hasSelection = selIdx >= 0;

      // Build highlight set: selected + its direct neighbors
      const highlightSet = new Set<number>();
      if (hasSelection) {
        highlightSet.add(selIdx);
        for (const e of edgesRef.current) {
          if (e.source === selId) { const ti = nim.get(e.target); if (ti != null) highlightSet.add(ti); }
          if (e.target === selId) { const si = nim.get(e.source); if (si != null) highlightSet.add(si); }
        }
        // Also highlight sibling instances (same email as selected instance)
        const selNode = nodes[selIdx];
        if (selNode.kind === "instance") {
          const email = (selNode as InstanceNode).email;
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].kind === "instance" && (nodes[i] as InstanceNode).email === email) highlightSet.add(i);
          }
        }
      }

      // -- Edges --
      ctx.lineWidth = 0.5 / v.scale;
      const showR = showRolesRef.current, showM = showModulesRef.current;

      if (!isInteracting) {
        if (hasSelection) {
          ctx.globalAlpha = 0.55;
          for (const e of edgesRef.current) {
            if (e.source !== selId && e.target !== selId) continue;
            if (!showR && e.target.startsWith("role:")) continue;
            if (!showM && e.target.startsWith("module:")) continue;
            const si = nim.get(e.source) ?? -1, ti = nim.get(e.target) ?? -1;
            if (si < 0 || ti < 0) continue;
            ctx.strokeStyle = e.color;
            ctx.beginPath();
            ctx.moveTo(pos[si * 2], pos[si * 2 + 1]);
            ctx.lineTo(pos[ti * 2], pos[ti * 2 + 1]);
            ctx.stroke();
          }
        } else {
          const batches = new Map<string, Array<[number, number, number, number]>>();
          for (const e of edgesRef.current) {
            if (!showR && e.target.startsWith("role:")) continue;
            if (!showM && e.target.startsWith("module:")) continue;
            const si = nim.get(e.source) ?? -1, ti = nim.get(e.target) ?? -1;
            if (si < 0 || ti < 0) continue;
            const sx = pos[si * 2], sy = pos[si * 2 + 1];
            const tx = pos[ti * 2], ty = pos[ti * 2 + 1];
            if (sx < minWX && tx < minWX) continue; if (sx > maxWX && tx > maxWX) continue;
            if (sy < minWY && ty < minWY) continue; if (sy > maxWY && ty > maxWY) continue;
            const list = batches.get(e.color) ?? [];
            list.push([sx, sy, tx, ty]);
            batches.set(e.color, list);
          }
          ctx.globalAlpha = EDGE_ALPHA;
          for (const [color, lines] of batches) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            for (const [sx, sy, tx, ty] of lines) { ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // -- Instance / user nodes --
      const showLabels = v.scale > 280;
      const rNormal = 3 / v.scale;
      const rBright = 4.5 / v.scale;
      const rSelected = 9 / v.scale;

      const dimBatches = new Map<string, [number, number][]>();
      const brightBatches = new Map<string, [number, number][]>();

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.kind === "role" || n.kind === "module") continue; // drawn separately
        const nx = pos[i * 2], ny = pos[i * 2 + 1];
        if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;
        if (n.id === selId) continue;
        const isDim = hasSelection && !highlightSet.has(i);
        const target = isDim ? dimBatches : brightBatches;
        const list = target.get(n.color) ?? [];
        list.push([nx, ny]);
        target.set(n.color, list);
      }

      if (hasSelection) {
        ctx.globalAlpha = 0.10;
        const sprite = spritesRef.current.get("#9CA3AF") ?? [...spritesRef.current.values()][0];
        if (sprite) {
          const d = rNormal * 2;
          for (const coords of dimBatches.values()) {
            for (const [nx, ny] of coords) ctx.drawImage(sprite, nx - rNormal, ny - rNormal, d, d);
          }
        }
      }

      ctx.globalAlpha = hasSelection ? 1.0 : 0.78;
      const r = hasSelection ? rBright : rNormal;
      const d = r * 2;
      for (const [color, coords] of brightBatches) {
        const sprite = spritesRef.current.get(color);
        if (!sprite) continue;
        for (const [nx, ny] of coords) ctx.drawImage(sprite, nx - r, ny - r, d, d);
      }

      // -- Role hub diamonds --
      if (showR) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.kind !== "role") continue;
          const nx = pos[i * 2], ny = pos[i * 2 + 1];
          if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;
          const rr = (n as RoleNode).radius / v.scale;
          const dimmed = hasSelection && !highlightSet.has(i);
          ctx.globalAlpha = dimmed ? 0.08 : 0.9;
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.moveTo(nx, ny - rr); ctx.lineTo(nx + rr, ny);
          ctx.lineTo(nx, ny + rr); ctx.lineTo(nx - rr, ny);
          ctx.closePath(); ctx.fill();
          if (!dimmed && showLabels && rr > 5 / v.scale) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#111";
            ctx.font = `${Math.max(4, 7 / v.scale)}px sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText((n as RoleNode).label, nx, ny + 0.5 / v.scale);
          }
        }
      }

      // -- Module hub squares --
      if (showM) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.kind !== "module") continue;
          const nx = pos[i * 2], ny = pos[i * 2 + 1];
          if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;
          const rs = 7 / v.scale;
          const dimmed = hasSelection && !highlightSet.has(i);
          ctx.globalAlpha = dimmed ? 0.07 : 0.85;
          ctx.fillStyle = n.color;
          ctx.fillRect(nx - rs, ny - rs, rs * 2, rs * 2);
          if (!dimmed && showLabels && rs > 5 / v.scale) {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = "#111";
            ctx.font = `${Math.max(3, 6 / v.scale)}px sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText((n as ModuleNode).label, nx, ny + rs + 5 / v.scale);
          }
        }
      }

      // -- Selected node ring --
      if (hasSelection && selIdx >= 0) {
        const sx = pos[selIdx * 2], sy = pos[selIdx * 2 + 1];
        const color = nodes[selIdx].color;
        ctx.globalAlpha = 0.2; ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx, sy, rSelected * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0; ctx.strokeStyle = "#222"; ctx.lineWidth = 2 / v.scale;
        ctx.beginPath(); ctx.arc(sx, sy, rSelected, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx, sy, rSelected * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // -- Labels when zoomed in --
      if (showLabels) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = "#111";
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.kind !== "instance" && n.kind !== "user") continue;
          if (hasSelection && !highlightSet.has(i)) continue;
          const nx = pos[i * 2], ny = pos[i * 2 + 1];
          if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;
          const label = n.kind === "instance"
            ? getFirstName((n as InstanceNode).name, (n as InstanceNode).email).slice(0, 3)
            : ((n as UserNode).found ? getFirstName((n as UserNode).name, (n as UserNode).email) : "?");
          ctx.font = `bold ${Math.max(3, 5 / v.scale)}px sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(label, nx, ny + 0.5 / v.scale);
        }
      }

      ctx.globalAlpha = 1.0;
    };

    rafId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rebuildGrid = useCallback(() => {
    const cellSize = Math.max(0.005, 60 / view.current.scale);
    gridRef.current = buildGrid(posRef.current, nodesRef.current.length, cellSize);
  }, []);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true; setIsDraggingState(true);
    clickStart.current = { x: e.clientX, y: e.clientY };
    lastMouse.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x, dy = e.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else {
      const node = hitTest(lx, ly);
      setHoveredNode(node);
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly + 12}px)`;
        tooltipRef.current.style.opacity = node ? "1" : "0";
      }
    }
  }, [hitTest]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = false; setIsDraggingState(false);
    rebuildGrid();
    const moved = Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y);
    if (moved < 5) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const node = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (node) {
        if (node.kind === "instance") {
          const inst = node as InstanceNode;
          const sp: SidePanelState = {
            node,
            userProjectCount: emailInstanceCount.get(inst.email) ?? 1,
          };
          setSelectedNode(sp); selectedNodeRef.current = sp;
        } else if (node.kind === "user") {
          const sp: SidePanelState = { node };
          setSelectedNode(sp); selectedNodeRef.current = sp;
        } else if (node.kind === "role") {
          const rn = node as RoleNode;
          const sp: SidePanelState = { node: rn, roleUsers: roleUserMap.get(rn.roleName) ?? [] };
          setSelectedNode(sp); selectedNodeRef.current = sp;
        } else if (node.kind === "module") {
          const mn = node as ModuleNode;
          // Collect unique user names from instances that have this module
          const names: string[] = [];
          const seen = new Set<string>();
          for (const n of nodesRef.current) {
            if (n.kind !== "instance") continue;
            const inst = n as InstanceNode;
            if (inst.modules.includes(mn.moduleName) && !seen.has(inst.email)) {
              seen.add(inst.email);
              names.push(inst.name || inst.email);
            }
          }
          const sp: SidePanelState = { node: mn, moduleInstances: names };
          setSelectedNode(sp); selectedNodeRef.current = sp;
        }
      } else {
        setSelectedNode(null); selectedNodeRef.current = null;
      }
    }
  }, [hitTest, rebuildGrid, roleUserMap, emailInstanceCount]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const v = view.current;
    const wx = v.x + (mx - cx) / v.scale, wy = v.y + (my - cy) / v.scale;
    const newS = Math.max(10, Math.min(500000, v.scale * Math.pow(1.002, -e.deltaY)));
    view.current = { scale: newS, x: wx - (mx - cx) / newS, y: wy - (my - cy) / newS };
    targetView.current = { ...view.current };
    rebuildGrid();
  }, [rebuildGrid]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 1) { e.preventDefault(); zoomToFit(); }
  }, [zoomToFit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
    };
  }, [handleWheel, handleMouseDown]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => { if (nodesRef.current.length) zoomToFit(); });
    ro.observe(canvas.parentElement ?? canvas);
    return () => ro.disconnect();
  }, [zoomToFit]);

  function toggleShowRoles() {
    const next = !showRolesRef.current;
    showRolesRef.current = next;
    setShowRoles(next);
    zoomToFit();
  }

  function toggleShowModules() {
    const next = !showModulesRef.current;
    showModulesRef.current = next;
    setShowModules(next);
    zoomToFit();
  }

  const totalInstances = useMemo(
    () => users.reduce((s, u) => s + (u.found ? u.projects.length : 0), 0),
    [users]
  );

  if (!users.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ACC data available. Load ACC data in the ACC Analysis tab first.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 relative">
      <div
        ref={containerRef}
        className={`flex-1 relative rounded-xl border border-border/30 overflow-hidden transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"}`}
        style={{ background: "#F8F7F4" }}
      >
        {/* Controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <div className="flex gap-1">
            <ControlButton active={showRoles} onClick={toggleShowRoles}>
              {showRoles ? "Hide Roles" : "Show Roles"}
            </ControlButton>
            <ControlButton active={showModules} onClick={toggleShowModules}>
              {showModules ? "Hide Modules" : "Show Modules"}
            </ControlButton>
            <ControlButton active={false} onClick={zoomToFit}>Fit</ControlButton>
            <button
              onClick={() => {
                if (isRefreshingRef.current) return;
                isRefreshingRef.current = true;
                invalidateLayout.mutate(undefined, {
                  onSettled: () => {
                    setRefreshKey((k) => k + 1);
                    // layoutQuery refetch will be triggered by the dependency change
                    layoutQuery.refetch();
                  },
                  onError: () => {
                    isRefreshingRef.current = false;
                  },
                });
              }}
              disabled={invalidateLayout.isPending}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
                "bg-white/80 text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-400",
                invalidateLayout.isPending && "opacity-50 cursor-not-allowed"
              )}
            >
              {invalidateLayout.isPending ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                  {" "}Refreshing…
                </>
              ) : (
                "Refresh Layout"
              )}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 pr-1">
            {totalInstances.toLocaleString()} instances · scroll to zoom · drag to pan · middle-click to fit
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2">
          <LegendDot color="#10B981" label="Project Admin" />
          <LegendDot color="#F59E0B" label="No Projects" />
          <LegendDot color="#9CA3AF" label="Not Cached" />
          <span className="text-[10px] text-gray-400">· colored by primary role</span>
          {showRoles && <LegendDiamond color={ROLE_HUB_COLOR} label="Role" />}
          {showModules && <LegendSquare color={MODULE_HUB_COLOR} label="Module" />}
        </div>

        {/* Loading */}
        {!simulationDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              <span className="text-xs">Running layout for {users.length.toLocaleString()} users…</span>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={cn(
            "w-full h-full block",
            isDraggingState ? "cursor-grabbing" : hoveredNode ? "cursor-pointer" : "cursor-crosshair"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            isDragging.current = false; setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
          }}
        />

        {/* Tooltip */}
        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg max-w-[240px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            hoveredNode.kind === "instance" ? <InstanceTooltip node={hoveredNode as InstanceNode} /> :
            hoveredNode.kind === "user" ? <UserTooltip node={hoveredNode as UserNode} /> :
            hoveredNode.kind === "role" ? <RoleTooltip node={hoveredNode as RoleNode} /> :
            <ModuleTooltip node={hoveredNode as ModuleNode} />
          )}
        </div>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <SidePanel
          state={selectedNode}
          onClose={() => { setSelectedNode(null); selectedNodeRef.current = null; }}
          onViewProfile={
            (selectedNode.node.kind === "instance" || selectedNode.node.kind === "user")
              ? () => {
                  const email = selectedNode.node.kind === "instance"
                    ? (selectedNode.node as InstanceNode).email
                    : (selectedNode.node as UserNode).email;
                  onSelectUser?.(email);
                  setSelectedNode(null); selectedNodeRef.current = null;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
        active
          ? "bg-gray-900/10 text-gray-900 border-gray-400/40"
          : "bg-white/80 text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-400"
      )}
    >
      {children}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function LegendDiamond({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} /></svg>
      {label}
    </div>
  );
}

function LegendSquare({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function InstanceTooltip({ node }: { node: InstanceNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500 truncate">{node.projectName}</p>
      {node.isAdmin && <p className="text-[10px] font-medium text-emerald-600">Project Admin</p>}
      {node.roles.length > 0 && (
        <p className="text-[10px] text-gray-400">
          {node.roles.slice(0, 2).join(", ")}{node.roles.length > 2 ? ` +${node.roles.length - 2}` : ""}
        </p>
      )}
      {node.modules.length > 0 && (
        <p className="text-[10px] text-sky-500">{node.modules.length} module{node.modules.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

function UserTooltip({ node }: { node: UserNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500">{node.email}</p>
      {!node.found && <p className="text-[10px] text-gray-400 italic">Not cached in ACC</p>}
      {node.found && node.hasNoProjects && <p className="text-[10px] text-amber-500">No projects assigned</p>}
    </div>
  );
}

function RoleTooltip({ node }: { node: RoleNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900">{node.roleName}</p>
      <p className="text-[10px] text-gray-500">{node.instanceCount} instance{node.instanceCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

function ModuleTooltip({ node }: { node: ModuleNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900">{moduleLabel(node.moduleName)}</p>
      <p className="text-[10px] text-gray-500">{node.instanceCount} instance{node.instanceCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

function SidePanel({ state, onClose, onViewProfile }: {
  state: SidePanelState;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  const n = state.node;

  const title = n.kind === "instance" ? ((n as InstanceNode).name || (n as InstanceNode).email) :
                n.kind === "user" ? ((n as UserNode).name || (n as UserNode).email) :
                n.kind === "role" ? (n as RoleNode).roleName :
                moduleLabel((n as ModuleNode).moduleName);

  return (
    <div className="w-64 shrink-0 ml-3 bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">&times;</button>
      </div>

      {n.kind === "instance" && (() => {
        const inst = n as InstanceNode;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 break-all">{inst.email}</p>
            {state.userProjectCount != null && state.userProjectCount > 1 && (
              <p className="text-[10px] text-gray-400 italic">{state.userProjectCount} project instances in ACC</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {inst.isAdmin && <Tag color="emerald">Project Admin</Tag>}
              <Tag color="gray">{inst.projectName}</Tag>
              {inst.projectStatus && inst.projectStatus !== "active" && (
                <Tag color="amber">{inst.projectStatus}</Tag>
              )}
            </div>
            {inst.roles.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {inst.roles.map((r) => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">{r}</span>
                  ))}
                </div>
              </div>
            )}
            {inst.modules.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Modules</p>
                <div className="flex flex-wrap gap-1">
                  {inst.modules.map((m) => (
                    <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">{moduleLabel(m)}</span>
                  ))}
                </div>
              </div>
            )}
            {onViewProfile && (
              <button
                onClick={onViewProfile}
                className="w-full text-xs font-medium py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all"
              >
                View Profile
              </button>
            )}
          </div>
        );
      })()}

      {n.kind === "user" && (() => {
        const u = n as UserNode;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 break-all">{u.email}</p>
            {!u.found && (
              <p className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg px-2 py-1.5">
                Not yet synced to ACC.
              </p>
            )}
            {u.found && u.hasNoProjects && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                Synced but no projects assigned.
              </p>
            )}
            {u.allRoles.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {u.allRoles.map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">{r}</span>
                ))}
              </div>
            )}
            {onViewProfile && (
              <button
                onClick={onViewProfile}
                className="w-full text-xs font-medium py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all"
              >
                View Profile
              </button>
            )}
          </div>
        );
      })()}

      {n.kind === "role" && (() => {
        const r = n as RoleNode;
        const roleUsers = state.roleUsers ?? [];
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">{r.instanceCount} assignment{r.instanceCount !== 1 ? "s" : ""} across all projects</p>
            {roleUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Users</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {[...new Set(roleUsers)].map((name) => (
                    <div key={name} className="text-[11px] text-gray-700 px-2 py-1 rounded-lg bg-gray-50">{name}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {n.kind === "module" && (() => {
        const m = n as ModuleNode;
        const users = state.moduleInstances ?? [];
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">{m.instanceCount} project assignment{m.instanceCount !== 1 ? "s" : ""}</p>
            {users.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Users with access</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {users.map((name) => (
                    <div key={name} className="text-[11px] text-gray-700 px-2 py-1 rounded-lg bg-gray-50">{name}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Tag({ color, children }: { color: "emerald" | "amber" | "gray"; children: React.ReactNode }) {
  const styles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    gray: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[color]}`}>
      {children}
    </span>
  );
}
