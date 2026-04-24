"use client";

import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { moduleLabel } from "@/lib/acc/modules";
import { SIM_WIDTH, SIM_HEIGHT, type PhysicsNode, type PhysicsEdge, runSimulation } from "@/lib/acc/graphSimulation";
import {
  CanvasGraphRenderer,
  WebGpuGraphRenderer,
  getVisibleWorldBounds,
  type GraphRenderFrame,
  type GraphRenderer,
} from "./graphRenderers";
import { type BulkAccUser } from "./AccAnalysisPanel";

interface UserNode {
  kind: "user";
  id: string;
  email: string;
  name: string;
  found: boolean;
  hasNoProjects: boolean;
  isAdmin: boolean;
  projectCount: number;
  roles: string[];
  modules: string[];
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface RoleNode {
  kind: "role";
  id: string;
  label: string;
  roleName: string;
  userCount: number;
  radius: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ModuleNode {
  kind: "module";
  id: string;
  label: string;
  moduleName: string;
  userCount: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type SimNode = UserNode | RoleNode | ModuleNode;

interface Edge {
  source: string;
  target: string;
  color: string;
  weight: number;
}

interface Particle {
  si: number;
  ti: number;
  t: number;
  speed: number;
  color: string;
  isRole: boolean;
}

interface SidePanelState {
  node: SimNode;
  roleUsers?: string[];
  moduleUsers?: string[];
}

interface SpatialGrid {
  size: number;
  cells: Map<string, number[]>;
}

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

const VIBRANT_COLORS: string[] = [
  "#E63946", "#F4A261", "#2A9D8F", "#264653", "#A8DADC",
  "#D62828", "#F77F00", "#FCBF49", "#003049", "#FF9F1C",
  "#2EC4B6", "#FFBF69", "#FF99C8", "#9B5DE5", "#F15BB5",
  "#FEE440", "#00BBF9", "#00F5D4", "#4361EE", "#3A0CA3",
  "#7209B7", "#560BAD", "#480CA8", "#B5179E", "#F72585",
  "#4CC9F0", "#8338EC", "#FF006E", "#FB5607", "#3D5A40",
];

const colorCache = new Map<string, string>();
const ROLE_HUB_COLOR = "#7C3AED";
const MODULE_HUB_COLOR = "#0EA5E9";
const GRAPH_BACKGROUND = "#F8F7F4";

function getCategoryColor(key: string | null | undefined): string {
  if (!key) return "#9CA3AF";
  const cached = colorCache.get(key);
  if (cached) return cached;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }

  const color = VIBRANT_COLORS[Math.abs(hash) % VIBRANT_COLORS.length];
  colorCache.set(key, color);
  return color;
}

function getFirstName(name: string, email: string): string {
  if (name?.trim()) return name.split(" ")[0].slice(0, 10);
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function truncate(str: string, n: number): string {
  return str.length > n ? `${str.slice(0, n - 3)}...` : str;
}

function buildGraph(users: BulkAccUser[]): { nodes: SimNode[]; edges: Edge[] } {
  const cx = SIM_WIDTH / 2;
  const cy = SIM_HEIGHT / 2;

  const roleFreq = new Map<string, number>();
  const moduleFreq = new Map<string, number>();
  const userNodes: UserNode[] = [];

  for (const user of users) {
    if (!user.found || user.projects.length === 0) continue;
    const uniqueRoles = new Set<string>();
    const uniqueModules = new Set<string>();
    for (const project of user.projects) {
      for (const role of project.roles) uniqueRoles.add(role);
      for (const moduleName of project.modules) uniqueModules.add(moduleName);
    }
    for (const role of uniqueRoles) roleFreq.set(role, (roleFreq.get(role) ?? 0) + 1);
    for (const moduleName of uniqueModules) moduleFreq.set(moduleName, (moduleFreq.get(moduleName) ?? 0) + 1);
  }

  let userIndex = 0;
  const foundUsersCount = users.filter((user) => user.found && user.projects.length > 0).length;
  for (const user of users) {
    if (!user.found || user.projects.length === 0) {
      userNodes.push({
        kind: "user",
        id: user.email,
        email: user.email,
        name: getFirstName(user.name, user.email),
        found: user.found,
        hasNoProjects: user.hasNoProjects,
        isAdmin: false,
        projectCount: 0,
        roles: user.allRoles || [],
        modules: [],
        color: user.found ? "#F59E0B" : "#9CA3AF",
        x: cx + (Math.random() - 0.5) * SIM_WIDTH * 0.55,
        y: cy + (Math.random() - 0.5) * SIM_HEIGHT * 0.55,
        vx: 0,
        vy: 0,
      });
      continue;
    }

    const uniqueRoles = new Set<string>();
    const uniqueModules = new Set<string>();
    let isAdmin = false;
    for (const project of user.projects) {
      if (project.isAdmin) isAdmin = true;
      for (const role of project.roles) uniqueRoles.add(role);
      for (const moduleName of project.modules) uniqueModules.add(moduleName);
    }

    const roles = Array.from(uniqueRoles);
    const modules = Array.from(uniqueModules);
    const primaryRole = roles.sort()[0] ?? null;
    const color = isAdmin ? "#10B981" : getCategoryColor(primaryRole);
    const angle = (userIndex / Math.max(1, foundUsersCount)) * Math.PI * 2;
    const radius = SIM_WIDTH * 0.12 + (Math.random() * 500 - 250);
    const yBias = isAdmin ? -SIM_HEIGHT * 0.06 : 0;

    userNodes.push({
      kind: "user",
      id: user.email,
      email: user.email,
      name: getFirstName(user.name, user.email),
      found: true,
      hasNoProjects: false,
      isAdmin,
      projectCount: user.projects.length,
      roles,
      modules,
      color,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius + yBias,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
    });
    userIndex++;
  }

  const roleNodes = new Map<string, RoleNode>();
  const maxRoleFreq = Math.max(1, ...roleFreq.values());
  const roleList = [...roleFreq.keys()];
  roleList.forEach((role, roleIndex) => {
    const count = roleFreq.get(role)!;
    const angle = (roleIndex / Math.max(1, roleList.length)) * Math.PI * 2;
    const spread = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.34;
    roleNodes.set(role, {
      kind: "role",
      id: `role:${role}`,
      label: truncate(role, 12),
      roleName: role,
      userCount: count,
      radius: 9 + (count / maxRoleFreq) * 7,
      color: ROLE_HUB_COLOR,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
    });
  });

  const moduleNodes = new Map<string, ModuleNode>();
  const maxModuleFreq = Math.max(1, ...moduleFreq.values());
  const moduleList = [...moduleFreq.keys()];
  moduleList.forEach((moduleName, moduleIndex) => {
    const angle = (moduleIndex / Math.max(1, moduleList.length)) * Math.PI * 2 + Math.PI / Math.max(1, moduleList.length);
    const spread = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.20;
    moduleNodes.set(moduleName, {
      kind: "module",
      id: `module:${moduleName}`,
      label: truncate(moduleLabel(moduleName), 10),
      moduleName,
      userCount: moduleFreq.get(moduleName) ?? maxModuleFreq,
      color: MODULE_HUB_COLOR,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
    });
  });

  const nodes: SimNode[] = [...userNodes, ...roleNodes.values(), ...moduleNodes.values()];
  const edges: Edge[] = [];
  for (const user of userNodes) {
    if (!user.found || user.hasNoProjects) continue;
    for (const role of user.roles) {
      const roleNode = roleNodes.get(role);
      if (roleNode) edges.push({ source: user.id, target: roleNode.id, color: user.color, weight: 1.0 });
    }
    for (const moduleName of user.modules) {
      const moduleNode = moduleNodes.get(moduleName);
      if (moduleNode) edges.push({ source: user.id, target: moduleNode.id, color: moduleNode.color, weight: 0.45 });
    }
  }

  return { nodes, edges };
}

function normalizePositions(settled: SimNode[]): Float32Array {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of settled) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const positions = new Float32Array(settled.length * 2);
  for (let i = 0; i < settled.length; i++) {
    positions[i * 2] = (settled[i].x - minX) / rangeX;
    positions[i * 2 + 1] = (settled[i].y - minY) / rangeY;
  }
  return positions;
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

function getOrderedNodeIds(nodes: readonly SimNode[]): string[] {
  return nodes.map((node) => node.id);
}

function orderedNodeIdsMatch(cachedIds: readonly string[] | null | undefined, nodes: readonly SimNode[]): boolean {
  if (!cachedIds || cachedIds.length !== nodes.length) return false;
  for (let i = 0; i < nodes.length; i++) {
    if (cachedIds[i] !== nodes[i].id) return false;
  }
  return true;
}

function getViewportSize(container: HTMLDivElement | null): { width: number; height: number } {
  return {
    width: container?.clientWidth || 900,
    height: container?.clientHeight || 600,
  };
}

function buildHighlightSet(
  edges: readonly Edge[],
  nodeIndexMap: ReadonlyMap<string, number>,
  selectedId: string | null,
  selectedIndex: number,
): Set<number> {
  const highlightSet = new Set<number>();
  if (!selectedId || selectedIndex < 0) return highlightSet;

  highlightSet.add(selectedIndex);
  for (const edge of edges) {
    if (edge.source === selectedId) {
      const targetIndex = nodeIndexMap.get(edge.target);
      if (targetIndex != null) highlightSet.add(targetIndex);
    }
    if (edge.target === selectedId) {
      const sourceIndex = nodeIndexMap.get(edge.source);
      if (sourceIndex != null) highlightSet.add(sourceIndex);
    }
  }
  return highlightSet;
}

interface LabelOverlayFrame {
  canvas: HTMLCanvasElement | null;
  nodes: readonly SimNode[];
  positions: Float32Array;
  roleIndices: Uint32Array;
  moduleIndices: Uint32Array;
  view: { x: number; y: number; scale: number };
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  showRoles: boolean;
  showModules: boolean;
  hasSelection: boolean;
  highlightSet: ReadonlySet<number>;
}

function drawLabelOverlay(frame: LabelOverlayFrame): void {
  const canvas = frame.canvas;
  if (!canvas) return;

  const dpr = Math.min(frame.devicePixelRatio || 1, 2);
  const wantWidth = Math.max(1, Math.floor(frame.cssWidth * dpr));
  const wantHeight = Math.max(1, Math.floor(frame.cssHeight * dpr));
  if (canvas.width !== wantWidth || canvas.height !== wantHeight) {
    canvas.width = wantWidth;
    canvas.height = wantHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.resetTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame.nodes.length || !frame.positions.length || frame.view.scale <= 420) return;

  ctx.scale(dpr, dpr);
  const bounds = getVisibleWorldBounds(frame.view, frame.cssWidth, frame.cssHeight, 50 / frame.view.scale);
  const toScreenX = (worldX: number) => frame.cssWidth / 2 + (worldX - frame.view.x) * frame.view.scale;
  const toScreenY = (worldY: number) => frame.cssHeight / 2 + (worldY - frame.view.y) * frame.view.scale;
  const isOnScreen = (screenX: number, screenY: number, margin = 80) =>
    screenX >= -margin &&
    screenX <= frame.cssWidth + margin &&
    screenY >= -margin &&
    screenY <= frame.cssHeight + margin;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (frame.showRoles) {
    for (let i = 0; i < frame.roleIndices.length; i++) {
      const index = frame.roleIndices[i];
      const node = frame.nodes[index] as RoleNode;
      const nx = frame.positions[index * 2];
      const ny = frame.positions[index * 2 + 1];
      if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
      if (frame.hasSelection && !frame.highlightSet.has(index)) continue;

      const radiusPx = node.radius;
      if (radiusPx < 9) continue;
      const sx = toScreenX(nx);
      const sy = toScreenY(ny);
      if (!isOnScreen(sx, sy)) continue;

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#111";
      ctx.font = `${Math.min(12, Math.max(10, radiusPx * 0.85))}px sans-serif`;
      ctx.fillText(node.label, sx, sy + 1);
    }
  }

  if (frame.showModules) {
    const moduleFont = "9px sans-serif";
    for (let i = 0; i < frame.moduleIndices.length; i++) {
      const index = frame.moduleIndices[i];
      const node = frame.nodes[index] as ModuleNode;
      const nx = frame.positions[index * 2];
      const ny = frame.positions[index * 2 + 1];
      if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
      if (frame.hasSelection && !frame.highlightSet.has(index)) continue;
      if (!frame.hasSelection && frame.view.scale < 650) continue;

      const radiusPx = 7;
      const sx = toScreenX(nx);
      const sy = toScreenY(ny);
      if (!isOnScreen(sx, sy)) continue;

      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#111";
      ctx.font = moduleFont;
      ctx.fillText(node.label, sx, sy + radiusPx + 9);
    }
  }

  ctx.globalAlpha = 1;
}

export function AccUsersGraph({ users, onSelectUser }: AccUsersGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const canvasRendererRef = useRef<CanvasGraphRenderer | null>(null);
  const webgpuRendererRef = useRef<WebGpuGraphRenderer | null>(null);
  const activeRendererRef = useRef<GraphRenderer | null>(null);

  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const posRef = useRef<Float32Array>(new Float32Array(0));
  const gridRef = useRef<SpatialGrid>({ size: 0.05, cells: new Map() });
  const nodeIndexMapRef = useRef(new Map<string, number>());
  const edgeIdxRoleRef = useRef(new Map<string, Uint32Array>());
  const edgeIdxModuleRef = useRef(new Map<string, Uint32Array>());
  const particlesRef = useRef<Particle[]>([]);
  const instIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const roleIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const moduleIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const needsRenderRef = useRef(true);

  const view = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const targetView = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });
  const showRolesRef = useRef(true);
  const showModulesRef = useRef(true);
  const selectedNodeRef = useRef<SidePanelState | null>(null);
  const isRefreshingRef = useRef(false);

  const [showRoles, setShowRoles] = useState(true);
  const [showModules, setShowModules] = useState(true);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const [simulationDone, setSimulationDone] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renderBackend, setRenderBackend] = useState<"canvas2d" | "webgpu">("canvas2d");
  const [rendererFailureReason, setRendererFailureReason] = useState<string | null>(null);

  const roleUserMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const user of users) {
      if (!user.found) continue;
      for (const project of user.projects) {
        for (const role of project.roles) {
          const list = map.get(role) ?? [];
          list.push(user.name || user.email);
          map.set(role, list);
        }
      }
    }
    return map;
  }, [users]);

  const layoutQuery = trpc.users.getGraphLayout.useQuery(undefined, {
    enabled: users.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const saveLayout = trpc.users.saveGraphLayout.useMutation();
  const invalidateLayout = trpc.users.invalidateGraphLayout.useMutation();

  const markGraphDirty = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  const buildLayoutBuffers = useCallback((nodes: SimNode[], edges: Edge[], nodeIndexMap: Map<string, number>) => {
    const roleGroups = new Map<string, number[]>();
    const moduleGroups = new Map<string, number[]>();
    for (const edge of edges) {
      const sourceIndex = nodeIndexMap.get(edge.source);
      const targetIndex = nodeIndexMap.get(edge.target);
      if (sourceIndex == null || targetIndex == null) continue;
      const targetGroups = edge.target.startsWith("role:") ? roleGroups : moduleGroups;
      const list = targetGroups.get(edge.color) ?? [];
      list.push(sourceIndex, targetIndex);
      targetGroups.set(edge.color, list);
    }

    edgeIdxRoleRef.current = new Map(
      Array.from(roleGroups.entries(), ([color, indices]) => [color, new Uint32Array(indices)]),
    );
    edgeIdxModuleRef.current = new Map(
      Array.from(moduleGroups.entries(), ([color, indices]) => [color, new Uint32Array(indices)]),
    );

    const particles: Particle[] = [];
    const maxParticles = 1000;
    const particlesPerEdge = edges.length > 500 ? 1 : 2;
    for (const edge of edges) {
      if (particles.length >= maxParticles) break;
      const sourceIndex = nodeIndexMap.get(edge.source);
      const targetIndex = nodeIndexMap.get(edge.target);
      if (sourceIndex == null || targetIndex == null) continue;

      const isRole = edge.target.startsWith("role:");
      const count = Math.random() > 0.5 ? particlesPerEdge : Math.max(0, particlesPerEdge - 1);
      for (let p = 0; p < count; p++) {
        particles.push({
          si: sourceIndex,
          ti: targetIndex,
          t: Math.random(),
          speed: 0.002 + Math.random() * 0.004,
          color: isRole ? ROLE_HUB_COLOR : MODULE_HUB_COLOR,
          isRole,
        });
      }
    }
    particlesRef.current = particles;

    const userIndices: number[] = [];
    const roleIndices: number[] = [];
    const moduleIndices: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].kind === "user") userIndices.push(i);
      else if (nodes[i].kind === "role") roleIndices.push(i);
      else moduleIndices.push(i);
    }

    instIdxRef.current = new Uint32Array(userIndices);
    roleIdxRef.current = new Uint32Array(roleIndices);
    moduleIdxRef.current = new Uint32Array(moduleIndices);
    markGraphDirty();
  }, [markGraphDirty]);

  const zoomToFit = useCallback((options?: { immediate?: boolean }) => {
    if (!posRef.current.length) return;

    const nodes = nodesRef.current;
    const positions = posRef.current;
    if (!nodes.length) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.kind === "role" && !showRolesRef.current) continue;
      if (node.kind === "module" && !showModulesRef.current) continue;
      const nx = positions[i * 2];
      const ny = positions[i * 2 + 1];
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }

    if (minX === Infinity) return;

    const { width, height } = getViewportSize(containerRef.current);
    const graphWidth = maxX - minX || 0.01;
    const graphHeight = maxY - minY || 0.01;
    const fitScale = Math.min(width / graphWidth, height / graphHeight) * 0.80;
    const nextView = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(0.01, Math.min(500000, fitScale)),
    };
    targetView.current = nextView;
    if (options?.immediate) {
      view.current = { ...nextView };
    }
    markGraphDirty();
  }, [markGraphDirty]);

  const rebuildGrid = useCallback(() => {
    const cellSize = Math.max(0.005, 60 / view.current.scale);
    gridRef.current = buildGrid(posRef.current, nodesRef.current.length, cellSize);
  }, []);

  const hitTest = useCallback((sx: number, sy: number): SimNode | null => {
    if (!posRef.current.length) return null;

    const { width, height } = getViewportSize(containerRef.current);
    const v = view.current;
    const wx = v.x + (sx - width / 2) / v.scale;
    const wy = v.y + (sy - height / 2) / v.scale;
    const grid = gridRef.current;
    if (!grid.cells.size) return null;

    const nodes = nodesRef.current;
    const positions = posRef.current;
    const gx = Math.floor(wx / grid.size);
    const gy = Math.floor(wy / grid.size);
    let bestDist = 15 / v.scale;
    let bestIndex = -1;

    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cell = grid.cells.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;
        for (const index of cell) {
          const node = nodes[index];
          if (node.kind === "role" && !showRolesRef.current) continue;
          if (node.kind === "module" && !showModulesRef.current) continue;
          const dx = positions[index * 2] - wx;
          const dy = positions[index * 2 + 1] - wy;
          const dist = Math.hypot(dx, dy);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        }
      }
    }

    return bestIndex >= 0 ? nodes[bestIndex] : null;
  }, []);

  useEffect(() => {
    const canvas2d = canvas2dRef.current;
    const webgpuCanvas = webgpuCanvasRef.current;
    if (!canvas2d || !webgpuCanvas) return;

    let disposed = false;
    const canvasRenderer = new CanvasGraphRenderer(canvas2d);
    canvasRendererRef.current = canvasRenderer;
    activeRendererRef.current = canvasRenderer;
    setRenderBackend("canvas2d");
    setRendererFailureReason(null);
    markGraphDirty();

    const fallBackToCanvas = (reason: string) => {
      if (disposed) return;
      webgpuRendererRef.current?.destroy();
      webgpuRendererRef.current = null;
      activeRendererRef.current = canvasRendererRef.current;
      setRenderBackend("canvas2d");
      setRendererFailureReason(reason);
      markGraphDirty();
    };

    void (async () => {
      const { renderer, failureReason } = await WebGpuGraphRenderer.create(webgpuCanvas, fallBackToCanvas);
      if (disposed) {
        renderer?.destroy();
        return;
      }
      if (!renderer) {
        setRenderBackend("canvas2d");
        setRendererFailureReason(failureReason ?? "WebGPU initialization failed");
        markGraphDirty();
        return;
      }

      webgpuRendererRef.current = renderer;
      activeRendererRef.current = renderer;
      setRenderBackend("webgpu");
      setRendererFailureReason(null);
      markGraphDirty();
    })();

    return () => {
      disposed = true;
      activeRendererRef.current = null;
      canvasRendererRef.current?.destroy();
      canvasRendererRef.current = null;
      webgpuRendererRef.current?.destroy();
      webgpuRendererRef.current = null;
    };
  }, [markGraphDirty]);

  useEffect(() => {
    if (rendererFailureReason) {
      console.debug(`[AccUsersGraph] renderer backend=${renderBackend}; fallback=${rendererFailureReason}`);
      return;
    }
    console.debug(`[AccUsersGraph] renderer backend=${renderBackend}`);
  }, [renderBackend, rendererFailureReason]);

  useEffect(() => {
    if (!users.length) return;
    if (isRefreshingRef.current) return;

    setSimulationDone(false);
    setIsReady(false);

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users);
    edgesRef.current = rawEdges;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      const layout = layoutQuery.data;

      if (
        !cancelled &&
        layout?.hit &&
        layout.positions &&
        layout.positions.length === rawNodes.length * 2 &&
        layout.nodeCount === rawNodes.length &&
        orderedNodeIdsMatch(layout.nodeIds, rawNodes)
      ) {
        posRef.current = new Float32Array(layout.positions as number[]);
        nodesRef.current = rawNodes;

        const nodeIndexMap = new Map<string, number>();
        rawNodes.forEach((node, index) => nodeIndexMap.set(node.id, index));
        nodeIndexMapRef.current = nodeIndexMap;

        buildLayoutBuffers(rawNodes, rawEdges, nodeIndexMap);
        zoomToFit({ immediate: true });
        gridRef.current = buildGrid(posRef.current, rawNodes.length, Math.max(0.01, 60 / view.current.scale));
        setSimulationDone(true);
        isRefreshingRef.current = false;
        if (!cancelled) setIsReady(true);
        return;
      }

      if (cancelled) return;

      let settled: SimNode[];
      try {
        const physNodes: PhysicsNode[] = rawNodes.map((node) => ({
          id: node.id,
          kind: node.kind,
          x: node.x,
          y: node.y,
          vx: node.vx,
          vy: node.vy,
        }));
        const physEdges: PhysicsEdge[] = rawEdges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
        }));

        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelled) return;

        const physSettled = runSimulation(physNodes, physEdges);
        settled = rawNodes.map((node, index) => ({
          ...node,
          x: physSettled[index].x,
          y: physSettled[index].y,
          vx: physSettled[index].vx,
          vy: physSettled[index].vy,
        })) as SimNode[];
      } catch (error) {
        console.error("Simulation failed:", error);
        isRefreshingRef.current = false;
        return;
      }

      if (cancelled) return;

      nodesRef.current = settled;
      posRef.current = normalizePositions(settled);

      const nodeIndexMap = new Map<string, number>();
      settled.forEach((node, index) => nodeIndexMap.set(node.id, index));
      nodeIndexMapRef.current = nodeIndexMap;

      buildLayoutBuffers(settled, rawEdges, nodeIndexMap);
      zoomToFit({ immediate: true });
      gridRef.current = buildGrid(posRef.current, settled.length, Math.max(0.01, 60 / view.current.scale));
      setSimulationDone(true);
      isRefreshingRef.current = false;
      if (!cancelled) setIsReady(true);

      if (!cancelled && layout?.dataHash) {
        saveLayout.mutate(
          {
            positions: Array.from(posRef.current),
            dataHash: layout.dataHash,
            nodeCount: settled.length,
            nodeIds: getOrderedNodeIds(settled),
          },
          {
            onError: () => {
              // Silent fallback: a later load will recompute the layout.
            },
          },
        );
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [users, layoutQuery.data, refreshKey, buildLayoutBuffers, saveLayout, zoomToFit]);

  useEffect(() => {
    const render = () => {
      rafId.current = requestAnimationFrame(render);

      const renderer = activeRendererRef.current;
      if (!renderer) return;

      const v = view.current;
      const tv = targetView.current;
      const dxCam = Math.abs(tv.x - v.x);
      const dyCam = Math.abs(tv.y - v.y);
      const dsCam = Math.abs(tv.scale - v.scale);
      const camLerping = dxCam > 0.00001 || dyCam > 0.00001 || dsCam > 0.01;
      if (!camLerping && !needsRenderRef.current) return;

      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      const { width, height } = getViewportSize(containerRef.current);
      const nodes = nodesRef.current;
      const positions = posRef.current;
      const selectedId = selectedNodeRef.current?.node.id ?? null;
      const selectedIndex = selectedId ? (nodeIndexMapRef.current.get(selectedId) ?? -1) : -1;
      const highlightSet = buildHighlightSet(edgesRef.current, nodeIndexMapRef.current, selectedId, selectedIndex);
      const isInteracting =
        isDragging.current ||
        Math.abs(tv.x - v.x) > 0.0005 ||
        Math.abs(tv.y - v.y) > 0.0005 ||
        Math.abs(tv.scale - v.scale) > v.scale * 0.002;

      const frame: GraphRenderFrame = {
        nodes,
        positions,
        edges: edgesRef.current,
        particles: particlesRef.current,
        nodeIndexMap: nodeIndexMapRef.current,
        edgeGroupsRole: edgeIdxRoleRef.current,
        edgeGroupsModule: edgeIdxModuleRef.current,
        userIndices: instIdxRef.current,
        roleIndices: roleIdxRef.current,
        moduleIndices: moduleIdxRef.current,
        selectedNodeId: selectedId,
        selectedNodeIndex: selectedIndex,
        highlightSet,
        showRoles: showRolesRef.current,
        showModules: showModulesRef.current,
        isInteracting,
        view: v,
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        backgroundColor: GRAPH_BACKGROUND,
      };

      const drawResult = renderer.draw(frame);
      drawLabelOverlay({
        canvas: labelCanvasRef.current,
        nodes,
        positions,
        roleIndices: roleIdxRef.current,
        moduleIndices: moduleIdxRef.current,
        view: v,
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        showRoles: showRolesRef.current,
        showModules: showModulesRef.current,
        hasSelection: selectedIndex >= 0,
        highlightSet,
      });

      needsRenderRef.current = camLerping || drawResult.needsContinuousRedraw;
    };

    rafId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    isDragging.current = true;
    setIsDraggingState(true);
    clickStart.current = { x: event.clientX, y: event.clientY };
    lastMouse.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const lx = event.clientX - rect.left;
    const ly = event.clientY - rect.top;

    if (isDragging.current) {
      const dx = event.clientX - lastMouse.current.x;
      const dy = event.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: event.clientX, y: event.clientY };
      markGraphDirty();
      return;
    }

    const node = hitTest(lx, ly);
    setHoveredNode(node);
    if (tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly + 12}px)`;
      tooltipRef.current.style.opacity = node ? "1" : "0";
    }
  }, [hitTest, markGraphDirty]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    isDragging.current = false;
    setIsDraggingState(false);
    rebuildGrid();
    markGraphDirty();

    const moved = Math.hypot(event.clientX - clickStart.current.x, event.clientY - clickStart.current.y);
    if (moved >= 5) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const node = hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (!node) {
      setSelectedNode(null);
      selectedNodeRef.current = null;
      markGraphDirty();
      return;
    }

    if (node.kind === "user") {
      const state: SidePanelState = { node };
      setSelectedNode(state);
      selectedNodeRef.current = state;
      markGraphDirty();
      return;
    }

    if (node.kind === "role") {
      const roleNode = node as RoleNode;
      const state: SidePanelState = {
        node: roleNode,
        roleUsers: roleUserMap.get(roleNode.roleName) ?? [],
      };
      setSelectedNode(state);
      selectedNodeRef.current = state;
      markGraphDirty();
      return;
    }

    const moduleNode = node as ModuleNode;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const graphNode of nodesRef.current) {
      if (graphNode.kind !== "user") continue;
      const userNode = graphNode as UserNode;
      if (userNode.modules.includes(moduleNode.moduleName) && !seen.has(userNode.email)) {
        seen.add(userNode.email);
        names.push(userNode.name || userNode.email);
      }
    }
    const state: SidePanelState = { node: moduleNode, moduleUsers: names };
    setSelectedNode(state);
    selectedNodeRef.current = state;
    markGraphDirty();
  }, [hitTest, rebuildGrid, roleUserMap, markGraphDirty]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const canvas = event.currentTarget as HTMLCanvasElement | null;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const v = view.current;
    const wx = v.x + (mx - cx) / v.scale;
    const wy = v.y + (my - cy) / v.scale;
    const nextScale = Math.max(10, Math.min(500000, v.scale * Math.pow(1.002, -event.deltaY)));
    view.current = {
      scale: nextScale,
      x: wx - (mx - cx) / nextScale,
      y: wy - (my - cy) / nextScale,
    };
    targetView.current = { ...view.current };
    rebuildGrid();
    markGraphDirty();
  }, [rebuildGrid, markGraphDirty]);

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    zoomToFit();
  }, [zoomToFit]);

  useEffect(() => {
    const canvases = [canvas2dRef.current, webgpuCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      canvas.addEventListener("mousedown", handleMouseDown);
    }
    return () => {
      for (const canvas of canvases) {
        canvas.removeEventListener("wheel", handleWheel);
        canvas.removeEventListener("mousedown", handleMouseDown);
      }
    };
  }, [handleWheel, handleMouseDown]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (nodesRef.current.length) zoomToFit();
    });
    observer.observe(container);
    return () => observer.disconnect();
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
    () => users.reduce((sum, user) => sum + (user.found ? user.projects.length : 0), 0),
    [users],
  );

  const renderCanvasClass = cn(
    "absolute inset-0 block w-full h-full",
    isDraggingState ? "cursor-grabbing" : hoveredNode ? "cursor-pointer" : "cursor-crosshair",
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
        data-render-backend={renderBackend}
        data-renderer-failure-reason={rendererFailureReason ?? undefined}
        className="flex-1 relative rounded-xl border border-border/30 overflow-hidden"
        style={{ background: GRAPH_BACKGROUND }}
      >
        {!isReady && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4" />
            <span className="text-sm font-medium text-emerald-700">Calculating graph layout...</span>
          </div>
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <div className="flex gap-1">
            <ControlButton active={showRoles} onClick={toggleShowRoles}>
              {showRoles ? "Hide Roles" : "Show Roles"}
            </ControlButton>
            <ControlButton active={showModules} onClick={toggleShowModules}>
              {showModules ? "Hide Modules" : "Show Modules"}
            </ControlButton>
            <ControlButton active={false} onClick={() => zoomToFit()}>Fit</ControlButton>
            <button
              onClick={() => {
                if (isRefreshingRef.current) return;
                isRefreshingRef.current = true;
                invalidateLayout.mutate(undefined, {
                  onSettled: () => {
                    setRefreshKey((value) => value + 1);
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
                invalidateLayout.isPending && "opacity-50 cursor-not-allowed",
              )}
            >
              {invalidateLayout.isPending ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                  {" "}Refreshing...
                </>
              ) : (
                "Refresh Layout"
              )}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 pr-1">
            {totalInstances.toLocaleString()} instances - scroll to zoom - drag to pan - middle-click to fit
          </div>
        </div>

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2">
          <LegendDot color="#10B981" label="Project Admin" />
          <LegendDot color="#F59E0B" label="No Projects" />
          <LegendDot color="#9CA3AF" label="Not Cached" />
          <span className="text-[10px] text-gray-400">- colored by primary role</span>
          {showRoles && <LegendDiamond color={ROLE_HUB_COLOR} label="Role" />}
          {showModules && <LegendSquare color={MODULE_HUB_COLOR} label="Module" />}
        </div>

        {!simulationDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              <span className="text-xs">Running layout for {users.length.toLocaleString()} users...</span>
            </div>
          </div>
        )}

        <canvas
          ref={canvas2dRef}
          className={cn(renderCanvasClass, renderBackend === "canvas2d" ? "opacity-100" : "opacity-0 pointer-events-none")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            markGraphDirty();
          }}
        />
        <canvas
          ref={webgpuCanvasRef}
          className={cn(renderCanvasClass, renderBackend === "webgpu" ? "opacity-100" : "opacity-0 pointer-events-none")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            markGraphDirty();
          }}
        />
        <canvas
          ref={labelCanvasRef}
          className="absolute inset-0 block w-full h-full pointer-events-none"
        />

        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg max-w-[240px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            hoveredNode.kind === "user" ? <UserTooltip node={hoveredNode as UserNode} /> :
            hoveredNode.kind === "role" ? <RoleTooltip node={hoveredNode as RoleNode} /> :
            <ModuleTooltip node={hoveredNode as ModuleNode} />
          )}
        </div>
      </div>

      {selectedNode && (
        <SidePanel
          state={selectedNode}
          onClose={() => {
            setSelectedNode(null);
            selectedNodeRef.current = null;
            markGraphDirty();
          }}
          onViewProfile={
            selectedNode.node.kind === "user"
              ? () => {
                  const email = (selectedNode.node as UserNode).email;
                  onSelectUser?.(email);
                  setSelectedNode(null);
                  selectedNodeRef.current = null;
                  markGraphDirty();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

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
          ? "bg-gray-900/10 text-gray-900 border-gray-400/40"
          : "bg-white/80 text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-400",
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
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} />
      </svg>
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
      <p className="text-[10px] text-gray-500">{node.userCount} user{node.userCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

function ModuleTooltip({ node }: { node: ModuleNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900">{moduleLabel(node.moduleName)}</p>
      <p className="text-[10px] text-gray-500">{node.userCount} user{node.userCount !== 1 ? "s" : ""}</p>
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
  const node = state.node;
  const title = node.kind === "user"
    ? ((node as UserNode).name || (node as UserNode).email)
    : node.kind === "role"
      ? (node as RoleNode).roleName
      : moduleLabel((node as ModuleNode).moduleName);

  return (
    <div className="w-64 shrink-0 ml-3 bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">&times;</button>
      </div>

      {node.kind === "user" && (() => {
        const user = node as UserNode;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 break-all">{user.email}</p>
            {!user.found && (
              <p className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg px-2 py-1.5">
                Not yet synced to ACC.
              </p>
            )}
            {user.found && user.hasNoProjects && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                Synced but no projects assigned.
              </p>
            )}
            {user.projectCount > 0 && (
              <p className="text-[10px] text-gray-400 italic">
                In {user.projectCount} project{user.projectCount > 1 ? "s" : ""}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {user.isAdmin && <Tag color="emerald">Admin Access</Tag>}
            </div>
            {user.roles.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {user.modules.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Modules</p>
                <div className="flex flex-wrap gap-1">
                  {user.modules.map((moduleName) => (
                    <span
                      key={moduleName}
                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"
                    >
                      {moduleLabel(moduleName)}
                    </span>
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

      {node.kind === "role" && (() => {
        const roleNode = node as RoleNode;
        const roleUsers = state.roleUsers ?? [];
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">
              {roleNode.userCount} assignment{roleNode.userCount !== 1 ? "s" : ""} across all projects
            </p>
            {roleUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Users</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {[...new Set(roleUsers)].map((name) => (
                    <div key={name} className="text-[11px] text-gray-700 px-2 py-1 rounded-lg bg-gray-50">
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {node.kind === "module" && (() => {
        const moduleNode = node as ModuleNode;
        const moduleUsers = state.moduleUsers ?? [];
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">
              {moduleNode.userCount} project assignment{moduleNode.userCount !== 1 ? "s" : ""}
            </p>
            {moduleUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Users with access</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {moduleUsers.map((name) => (
                    <div key={name} className="text-[11px] text-gray-700 px-2 py-1 rounded-lg bg-gray-50">
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
