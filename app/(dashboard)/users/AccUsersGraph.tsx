"use client";

import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/core/utils";
import { type BulkAccUser } from "./AccAnalysisPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserNode {
  kind: "user";
  id: string;         // email
  label: string;      // first name or initials
  email: string;
  name: string;
  projectCount: number;
  hasNoProjects: boolean;
  isHubAdmin: boolean;
  roles: string[];
  allRoles: string[];
  found: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface RoleNode {
  kind: "role";
  id: string;         // "role:" + roleName
  label: string;      // role name (truncated)
  roleName: string;
  userCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

type SimNode = UserNode | RoleNode;

interface Edge {
  source: string;     // node id
  target: string;     // node id
  color: string;
  dashed: boolean;
  weight: number;
}

interface SidePanelState {
  node: SimNode;
  roleUsers?: string[];
}

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_RADIUS = 14;
const ROLE_BASE_RADIUS = 14;
const ROLE_MAX_RADIUS = 28;
const USER_COLOR_NORMAL = "#6366f1";
const USER_COLOR_NO_PROJECTS = "#f59e0b";
const USER_COLOR_HUB_ADMIN = "#10b981";
const USER_COLOR_NOT_FOUND = "#6b7280";
const ROLE_COLOR = "#8b5cf6";
const EDGE_COLOR = "rgba(139, 92, 246, 0.25)";
const SIM_ITERATIONS = 200;
const REPULSION = 3500;
const ATTRACTION = 0.08;
const DAMPING = 0.7;
const CENTER_GRAVITY = 0.04;
// Virtual simulation space — large so nodes spread out freely before normalization
const SIM_WIDTH = 4000;
const SIM_HEIGHT = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirstName(name: string, email: string): string {
  if (name && name.trim()) {
    return name.split(" ")[0].slice(0, 10);
  }
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function isHubAdmin(user: BulkAccUser): boolean {
  return user.allRoles.some((r) =>
    r.toLowerCase().includes("hub admin") ||
    r.toLowerCase().includes("account admin") ||
    r.toLowerCase().includes("administrator")
  );
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// ---------------------------------------------------------------------------
// Pre-rendered sprite (circle)
// ---------------------------------------------------------------------------

function createCircleSprite(color: string, radius: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const d = radius * 2;
  canvas.width = d;
  canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
  ctx.fill();
  // Subtle white rim
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  return canvas;
}

// ---------------------------------------------------------------------------
// Spring simulation (no d3) — runs in 4000×4000 virtual space, NO bounds clamping
// ---------------------------------------------------------------------------

function runSimulation(nodes: SimNode[], edges: Edge[]): SimNode[] {
  const ns: SimNode[] = nodes.map((n) => ({ ...n }));
  const cx = SIM_WIDTH / 2;
  const cy = SIM_HEIGHT / 2;

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const fx = new Float64Array(ns.length);
    const fy = new Float64Array(ns.length);

    // 1. Repulsion
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x || 0.01;
        const dy = ns[j].y - ns[i].y || 0.01;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) || 0.01;
        const force = REPULSION / dist2;
        const fx_ = (dx / dist) * force;
        const fy_ = (dy / dist) * force;
        fx[i] -= fx_;
        fy[i] -= fy_;
        fx[j] += fx_;
        fy[j] += fy_;
      }
    }

    // 2. Attraction along edges
    const idxMap = new Map(ns.map((n, i) => [n.id, i]));
    for (const e of edges) {
      const si = idxMap.get(e.source);
      const ti = idxMap.get(e.target);
      if (si == null || ti == null) continue;
      const dx = ns[ti].x - ns[si].x;
      const dy = ns[ti].y - ns[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = dist * ATTRACTION * e.weight;
      const fx_ = (dx / dist) * f;
      const fy_ = (dy / dist) * f;
      fx[si] += fx_;
      fy[si] += fy_;
      fx[ti] -= fx_;
      fy[ti] -= fy_;
    }

    // 3. Gravity toward center
    for (let i = 0; i < ns.length; i++) {
      fx[i] += (cx - ns[i].x) * CENTER_GRAVITY;
      fy[i] += (cy - ns[i].y) * CENTER_GRAVITY;
    }

    // 4. Integrate — NO bounds clamping
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
// Build nodes + edges — includes ALL users (found or not)
// ---------------------------------------------------------------------------

function buildGraph(users: BulkAccUser[]): { nodes: SimNode[]; edges: Edge[] } {
  // ALL users — including found===false
  const allUsers = users;
  const foundUsers = users.filter((u) => u.found);

  const cx = SIM_WIDTH / 2;
  const cy = SIM_HEIGHT / 2;

  // Role frequency only from found users (unfound have no roles)
  const roleFreq = new Map<string, number>();
  for (const u of foundUsers) {
    for (const r of u.allRoles) {
      roleFreq.set(r, (roleFreq.get(r) ?? 0) + 1);
    }
  }
  const maxRoleFreq = Math.max(1, ...roleFreq.values());

  // Role nodes
  const roleNodes = new Map<string, RoleNode>();
  let ri = 0;
  const roleList = [...roleFreq.keys()];
  for (const role of roleList) {
    const count = roleFreq.get(role)!;
    const angle = (ri / roleList.length) * Math.PI * 2;
    const spread = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.28;
    const radius = ROLE_BASE_RADIUS + ((count / maxRoleFreq) * (ROLE_MAX_RADIUS - ROLE_BASE_RADIUS));
    roleNodes.set(role, {
      kind: "role",
      id: `role:${role}`,
      label: truncate(role, 12),
      roleName: role,
      userCount: count,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      radius,
      color: ROLE_COLOR,
    });
    ri++;
  }

  // User nodes — ALL users, not-found ones get grey "?" nodes
  const userNodes: UserNode[] = allUsers.map((u, i) => {
    const angle = (i / allUsers.length) * Math.PI * 2;
    const r = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.15 + (Math.random() * 300 - 150);

    let color: string;
    if (!u.found) {
      color = USER_COLOR_NOT_FOUND;
    } else if (isHubAdmin(u)) {
      color = USER_COLOR_HUB_ADMIN;
    } else if (u.hasNoProjects) {
      color = USER_COLOR_NO_PROJECTS;
    } else {
      color = USER_COLOR_NORMAL;
    }

    return {
      kind: "user",
      id: u.email,
      label: u.found ? getFirstName(u.name, u.email) : "?",
      email: u.email,
      name: u.name,
      projectCount: u.projectCount,
      hasNoProjects: u.hasNoProjects,
      isHubAdmin: u.found ? isHubAdmin(u) : false,
      roles: u.allRoles,
      allRoles: u.allRoles,
      found: u.found,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: USER_RADIUS,
      color,
    };
  });

  const nodes: SimNode[] = [...userNodes, ...roleNodes.values()];

  // Edges: user -> role (only for found users with roles)
  const edges: Edge[] = [];
  for (const u of userNodes) {
    if (!u.found) continue;
    for (const role of u.allRoles) {
      const rn = roleNodes.get(role);
      if (!rn) continue;
      edges.push({
        source: u.id,
        target: rn.id,
        color: EDGE_COLOR,
        dashed: false,
        weight: 1,
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Normalize positions to [0,1] world space
// ---------------------------------------------------------------------------

function normalizePositions(settled: SimNode[]): Float32Array {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of settled) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
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

interface SpatialGrid {
  size: number;
  cells: Map<string, number[]>;
}

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

  // Simulation output stored in refs (no React re-renders per frame)
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const posRef = useRef<Float32Array>(new Float32Array(0));
  const gridRef = useRef<SpatialGrid>({ size: 0.05, cells: new Map() });
  const spritesRef = useRef(new Map<string, HTMLCanvasElement>());

  // Camera (world-space lerped)
  const view = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const targetView = useRef({ x: 0.5, y: 0.5, scale: 600 });

  // Interaction refs
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });

  // Controls stored in refs so render loop can read without re-render
  const showRolesRef = useRef(true);
  const highlightOutliersRef = useRef(false);
  const highlightNoProjectsRef = useRef(false);

  // React state just for button highlights
  const [showRoles, setShowRoles] = useState(true);
  const [highlightOutliers, setHighlightOutliers] = useState(false);
  const [highlightNoProjects, setHighlightNoProjects] = useState(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const selectedNodeRef = useRef<SidePanelState | null>(null);
  const [simulationDone, setSimulationDone] = useState(false);

  // Role user lookup map
  const roleUserMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of users) {
      if (!u.found) continue;
      for (const role of u.allRoles) {
        const list = m.get(role) ?? [];
        list.push(u.name || u.email);
        m.set(role, list);
      }
    }
    return m;
  }, [users]);

  // Build + run simulation when users change
  useEffect(() => {
    if (!users.length) return;
    setSimulationDone(false);

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users);
    edgesRef.current = rawEdges;

    const timeoutId = setTimeout(() => {
      const settled = runSimulation(rawNodes, rawEdges);
      nodesRef.current = settled;
      posRef.current = normalizePositions(settled);

      // Build spatial grid
      const cellSize = Math.max(0.01, 60 / view.current.scale);
      gridRef.current = buildGrid(posRef.current, settled.length, cellSize);

      // Pre-render sprites for each unique color
      const colorSet = new Set(settled.map((n) => n.color));
      colorSet.forEach((color) => {
        if (!spritesRef.current.has(color)) {
          spritesRef.current.set(color, createCircleSprite(color, USER_RADIUS));
        }
      });
      // Sprite for role nodes (slightly larger)
      if (!spritesRef.current.has(ROLE_COLOR + "_role")) {
        spritesRef.current.set(ROLE_COLOR + "_role", createCircleSprite(ROLE_COLOR, ROLE_MAX_RADIUS));
      }

      setSimulationDone(true);
      // Auto zoom-to-fit after simulation
      requestAnimationFrame(() => zoomToFit());
    }, 0);

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // ---------------------------------------------------------------------------
  // zoomToFit — fits all nodes in viewport with padding
  // ---------------------------------------------------------------------------
  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !posRef.current.length) return;

    const pos = posRef.current;
    const nodes = nodesRef.current;
    if (!nodes.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // Include only visible node types
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].kind === "role" && !showRolesRef.current) continue;
      const nx = pos[i * 2], ny = pos[i * 2 + 1];
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }

    if (minX === Infinity) return;

    const dw = maxX - minX || 0.01;
    const dh = maxY - minY || 0.01;
    const cw = canvas.clientWidth || 900;
    const ch = canvas.clientHeight || 600;

    const fitScale = Math.min(cw / dw, ch / dh) * 0.75;

    targetView.current = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(50, Math.min(50000, fitScale)),
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Hit test via spatial grid
  // ---------------------------------------------------------------------------
  const hitTest = useCallback((sx: number, sy: number): SimNode | null => {
    const canvas = canvasRef.current;
    if (!canvas || !posRef.current.length) return null;

    const v = view.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // Convert screen coords to world coords
    const wx = v.x + (sx - w / 2) / v.scale;
    const wy = v.y + (sy - h / 2) / v.scale;

    const g = gridRef.current;
    if (!g.cells.size) return null;

    const nodes = nodesRef.current;
    const pos = posRef.current;
    const gx = Math.floor(wx / g.size);
    const gy = Math.floor(wy / g.size);
    let bestDist = 20 / v.scale;
    let bestIdx = -1;

    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cell = g.cells.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;
        for (const idx of cell) {
          if (nodes[idx].kind === "role" && !showRolesRef.current) continue;
          const dx = pos[idx * 2] - wx;
          const dy = pos[idx * 2 + 1] - wy;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        }
      }
    }

    return bestIdx >= 0 ? nodes[bestIdx] : null;
  }, []);

  // ---------------------------------------------------------------------------
  // requestAnimationFrame render loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const render = () => {
      rafId.current = requestAnimationFrame(render);

      // Lerp camera
      const v = view.current;
      const tv = targetView.current;
      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      // Handle DPR + resize
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const wantW = Math.floor(w * dpr);
      const wantH = Math.floor(h * dpr);
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW;
        canvas.height = wantH;
      }

      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      // Background — use CSS variable if available
      const bg = getComputedStyle(canvas).getPropertyValue("--card").trim();
      ctx.fillStyle = bg ? `hsl(${bg})` : "#1a1a2e";
      ctx.fillRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const pos = posRef.current;
      if (!nodes.length || !pos.length) return;

      // Set up world-space transform
      ctx.translate(w / 2, h / 2);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.x, -v.y);

      const isInteracting = isDragging.current;

      // Viewport culling bounds in world space
      const pad = 40 / v.scale;
      const minWX = v.x - (w / 2) / v.scale - pad;
      const maxWX = v.x + (w / 2) / v.scale + pad;
      const minWY = v.y - (h / 2) / v.scale - pad;
      const maxWY = v.y + (h / 2) / v.scale + pad;

      // -- Edges --
      if (showRolesRef.current && !isInteracting) {
        ctx.lineWidth = 0.5 / v.scale;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = EDGE_COLOR;

        // Batch by color
        const batches = new Map<string, Array<[number, number, number, number]>>();
        for (const e of edgesRef.current) {
          const si = nodes.findIndex((n) => n.id === e.source);
          const ti = nodes.findIndex((n) => n.id === e.target);
          if (si < 0 || ti < 0) continue;
          const sx = pos[si * 2], sy = pos[si * 2 + 1];
          const tx = pos[ti * 2], ty = pos[ti * 2 + 1];
          // Viewport cull — skip if both endpoints off screen
          if (sx < minWX && tx < minWX) continue;
          if (sx > maxWX && tx > maxWX) continue;
          if (sy < minWY && ty < minWY) continue;
          if (sy > maxWY && ty > maxWY) continue;
          const list = batches.get(e.color) ?? [];
          list.push([sx, sy, tx, ty]);
          batches.set(e.color, list);
        }
        for (const [color, lines] of batches) {
          ctx.strokeStyle = color;
          ctx.beginPath();
          for (const [sx, sy, tx, ty] of lines) {
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // -- Nodes --
      const nodeScreenRadius = USER_RADIUS / v.scale;
      const showLabels = nodeScreenRadius > 10;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.kind === "role" && !showRolesRef.current) continue;

        const nx = pos[i * 2];
        const ny = pos[i * 2 + 1];

        // Viewport cull
        if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;

        if (n.kind === "user") {
          const un = n as UserNode;

          // Pulse ring for highlighted nodes
          const pulseOutlier = highlightOutliersRef.current && isOutlierNode(un, roleUserMap);
          const pulseNP = highlightNoProjectsRef.current && un.hasNoProjects;
          if (pulseOutlier || pulseNP) {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1.5 / v.scale;
            ctx.beginPath();
            ctx.arc(nx, ny, (USER_RADIUS + 6) / v.scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          // Draw circle sprite
          const sprite = spritesRef.current.get(n.color);
          if (sprite) {
            const r = USER_RADIUS / v.scale;
            const d = r * 2;
            ctx.drawImage(sprite, nx - r, ny - r, d, d);
          } else {
            ctx.fillStyle = n.color;
            ctx.beginPath();
            ctx.arc(nx, ny, USER_RADIUS / v.scale, 0, Math.PI * 2);
            ctx.fill();
          }

          // Label
          if (showLabels) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = `bold ${Math.max(5, 7 / v.scale)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(un.label.slice(0, 4), nx, ny + 0.5 / v.scale);
          }
        } else {
          // Role node — draw as diamond
          const rn = n as RoleNode;
          const r = rn.radius / v.scale;
          ctx.fillStyle = rn.color;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(nx, ny - r);
          ctx.lineTo(nx + r, ny);
          ctx.lineTo(nx, ny + r);
          ctx.lineTo(nx - r, ny);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1 / v.scale;
          ctx.stroke();
          ctx.globalAlpha = 1.0;

          if (showLabels && r > 8) {
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.font = `${Math.max(4, 8 / v.scale)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(rn.label, nx, ny + 0.5 / v.scale);
          }
        }
      }

      ctx.globalAlpha = 1.0;
    };

    rafId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild spatial grid when zoom changes significantly
  const rebuildGrid = useCallback(() => {
    const cellSize = Math.max(0.005, 60 / view.current.scale);
    gridRef.current = buildGrid(posRef.current, nodesRef.current.length, cellSize);
  }, []);

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    setIsDraggingState(true);
    clickStart.current = { x: e.clientX, y: e.clientY };
    lastMouse.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;

    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else {
      const node = hitTest(lx, ly);
      setHoveredNode(node);
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly - 10}px)`;
        tooltipRef.current.style.opacity = node ? "1" : "0";
      }
    }
  }, [hitTest]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = false;
    setIsDraggingState(false);
    rebuildGrid();

    const moved = Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y);
    if (moved < 5) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const node = hitTest(lx, ly);
      if (node) {
        if (node.kind === "user") {
          const sp = { node };
          setSelectedNode(sp);
          selectedNodeRef.current = sp;
        } else {
          const rn = node as RoleNode;
          const sp = { node: rn, roleUsers: roleUserMap.get(rn.roleName) ?? [] };
          setSelectedNode(sp);
          selectedNodeRef.current = sp;
        }
      } else {
        setSelectedNode(null);
        selectedNodeRef.current = null;
      }
    }
  }, [hitTest, rebuildGrid, roleUserMap]);

  // Wheel zoom toward cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const v = view.current;
    const wx = v.x + (mx - cx) / v.scale;
    const wy = v.y + (my - cy) / v.scale;
    const newS = Math.max(10, Math.min(50000, v.scale * Math.pow(1.002, -e.deltaY)));
    view.current = { scale: newS, x: wx - (mx - cx) / newS, y: wy - (my - cy) / newS };
    targetView.current = { ...view.current };
    rebuildGrid();
  }, [rebuildGrid]);

  // Middle click = zoom to fit
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      zoomToFit();
    }
  }, [zoomToFit]);

  // Attach native wheel + middle-click handlers
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

  // Resize observer — re-zoom when container resizes
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (nodesRef.current.length) zoomToFit();
    });
    ro.observe(canvas.parentElement ?? canvas);
    return () => ro.disconnect();
  }, [zoomToFit]);

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  function toggleShowRoles() {
    const next = !showRolesRef.current;
    showRolesRef.current = next;
    setShowRoles(next);
    zoomToFit();
  }

  function toggleOutliers() {
    const next = !highlightOutliersRef.current;
    highlightOutliersRef.current = next;
    setHighlightOutliers(next);
  }

  function toggleNoProjects() {
    const next = !highlightNoProjectsRef.current;
    highlightNoProjectsRef.current = next;
    setHighlightNoProjects(next);
  }

  function resetLayout() {
    if (!users.length) return;
    setSimulationDone(false);
    setSelectedNode(null);
    selectedNodeRef.current = null;

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users);
    edgesRef.current = rawEdges;

    setTimeout(() => {
      const settled = runSimulation(rawNodes, rawEdges);
      nodesRef.current = settled;
      posRef.current = normalizePositions(settled);
      const cellSize = Math.max(0.005, 60 / view.current.scale);
      gridRef.current = buildGrid(posRef.current, settled.length, cellSize);
      setSimulationDone(true);
      requestAnimationFrame(() => zoomToFit());
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (!users.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ACC data available. Load ACC data in the ACC Analysis tab first.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 relative">
      {/* Main graph area */}
      <div ref={containerRef} className="flex-1 relative bg-[hsl(var(--card))] rounded-xl border border-border/30 overflow-hidden">

        {/* Controls overlay */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <div className="flex gap-1">
            <ControlButton active={showRoles} onClick={toggleShowRoles}>
              {showRoles ? "Hide Roles" : "Show Roles"}
            </ControlButton>
            <ControlButton active={highlightOutliers} onClick={toggleOutliers}>
              Outliers
            </ControlButton>
            <ControlButton active={highlightNoProjects} onClick={toggleNoProjects}>
              No Projects
            </ControlButton>
            <ControlButton active={false} onClick={resetLayout}>
              Reset
            </ControlButton>
          </div>
          <div className="text-[10px] text-muted-foreground/60 pr-1">
            Scroll to zoom &bull; drag to pan &bull; click node for details &bull; middle-click to fit
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-card/80 backdrop-blur-sm border border-border/30 rounded-xl px-3 py-2">
          <LegendDot color={USER_COLOR_NORMAL} label="User" />
          <LegendDot color={USER_COLOR_HUB_ADMIN} label="Hub Admin" />
          <LegendDot color={USER_COLOR_NO_PROJECTS} label="No Projects" />
          <LegendDot color={USER_COLOR_NOT_FOUND} label="Not Cached" />
          {showRoles && <LegendDiamond color={ROLE_COLOR} label="Role" />}
        </div>

        {/* Loading state */}
        {!simulationDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs">Running layout simulation...</span>
            </div>
          </div>
        )}

        {/* Canvas */}
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
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
          }}
        />

        {/* Tooltip div overlay */}
        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2 shadow-xl max-w-[220px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            hoveredNode.kind === "user" ? (
              <UserTooltip node={hoveredNode as UserNode} />
            ) : (
              <RoleTooltip node={hoveredNode as RoleNode} />
            )
          )}
        </div>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <SidePanel
          state={selectedNode}
          onClose={() => {
            setSelectedNode(null);
            selectedNodeRef.current = null;
          }}
          onViewProfile={
            selectedNode.node.kind === "user"
              ? () => {
                  onSelectUser?.((selectedNode.node as UserNode).email);
                  setSelectedNode(null);
                  selectedNodeRef.current = null;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outlier detection helper
// ---------------------------------------------------------------------------

function isOutlierNode(n: UserNode, roleUserMap: Map<string, string[]>): boolean {
  if (n.allRoles.length === 0) return true;
  return n.allRoles.every((r) => {
    const freq = roleUserMap.get(r)?.length ?? 0;
    return freq <= 1;
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
        active
          ? "bg-primary/20 text-primary border-primary/30"
          : "bg-card/80 backdrop-blur-sm text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
      )}
    >
      {children}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function LegendDiamond({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} />
      </svg>
      {label}
    </div>
  );
}

function UserTooltip({ node }: { node: UserNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{node.name || node.email}</p>
      <p className="text-[10px] text-muted-foreground">{node.email}</p>
      {!node.found && (
        <p className="text-[10px] text-muted-foreground italic">Not cached in ACC</p>
      )}
      {node.found && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {node.projectCount} project{node.projectCount !== 1 ? "s" : ""}
          </span>
          {node.isHubAdmin && (
            <span className="text-[10px] text-emerald-400">Hub Admin</span>
          )}
          {node.hasNoProjects && (
            <span className="text-[10px] text-amber-400">No projects</span>
          )}
        </div>
      )}
      {node.allRoles.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Roles: {node.allRoles.slice(0, 3).join(", ")}{node.allRoles.length > 3 ? ` +${node.allRoles.length - 3}` : ""}
        </p>
      )}
    </div>
  );
}

function RoleTooltip({ node }: { node: RoleNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{node.roleName}</p>
      <p className="text-[10px] text-muted-foreground">{node.userCount} user{node.userCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

function SidePanel({
  state,
  onClose,
  onViewProfile,
}: {
  state: SidePanelState;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  const n = state.node;

  return (
    <div className="w-64 shrink-0 ml-3 bg-card rounded-xl border border-border/30 p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {n.kind === "user" ? (n as UserNode).name || (n as UserNode).email : (n as RoleNode).roleName}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {n.kind === "user" && (() => {
        const u = n as UserNode;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground break-all">{u.email}</p>

            {!u.found && (
              <p className="text-[11px] text-muted-foreground italic bg-muted/20 rounded-lg px-2 py-1.5">
                This user is not yet cached in ACC. No role or project data available.
              </p>
            )}

            {u.found && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {u.isHubAdmin && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      Hub Admin
                    </span>
                  )}
                  {u.hasNoProjects && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      No Projects
                    </span>
                  )}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {u.projectCount} project{u.projectCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {u.allRoles.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Roles</p>
                    <div className="flex flex-wrap gap-1">
                      {u.allRoles.map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {onViewProfile && (
              <button
                onClick={onViewProfile}
                className="w-full text-xs font-medium py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all"
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
            <p className="text-[11px] text-muted-foreground">
              {r.userCount} user{r.userCount !== 1 ? "s" : ""} with this role
            </p>
            {roleUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Users</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {roleUsers.map((name) => (
                    <div key={name} className="text-[11px] text-foreground px-2 py-1 rounded-lg bg-background/40">
                      {name}
                    </div>
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
