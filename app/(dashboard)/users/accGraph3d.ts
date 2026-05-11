"use client";

export type GraphDisplayMode = "2d" | "3d";
export type GraphRendererBackend = "canvas2d" | "cosmos" | "three3d";

export interface SemanticDepthNode {
  id: string;
  projectId?: string;
  isAdmin?: boolean;
  roles?: readonly string[];
  modules?: readonly string[];
  individualAccess?: boolean;
}

export const GRAPH_DISPLAY_MODE_KEY = "acc-graph-display-mode";
export const ACC_GRAPH_3D_POSITION_OPTIONS = {
  xyScale: 16,
  zScale: 14,
  volumeScale: 6,
} as const;
export const ACC_GRAPH_3D_CAMERA_OFFSET = {
  x: 0.78,
  y: -0.52,
  z: 1,
} as const;
export const ACC_GRAPH_3D_MAX_EDGES = 1500;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashToUnit(value: string): number {
  return hashString(value) / 0xffffffff;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function computeSemanticDepth(node: SemanticDepthNode): number {
  const project = node.projectId || "no-project";
  const role = node.roles?.[0] || "no-role";
  const moduleName = node.modules?.[0] || "no-module";
  const identity = node.id || `${project}:${role}:${moduleName}`;

  const projectBand = (hashToUnit(`project:${project}`) - 0.5) * 1.0;
  const roleBand = (hashToUnit(`role:${role}`) - 0.5) * 0.56;
  const moduleBand = (hashToUnit(`module:${moduleName}`) - 0.5) * 0.34;
  const accessBand = node.isAdmin ? 0.28 : -0.16;
  const individualBand = node.individualAccess ? 0.12 : 0;
  const jitter = (hashToUnit(`node:${identity}`) - 0.5) * 0.12;

  return clampUnit(projectBand + roleBand + moduleBand + accessBand + individualBand + jitter);
}

export function buildPositions3d(
  nodes: readonly SemanticDepthNode[],
  positions2d: Float32Array,
  options?: { xyScale?: number; zScale?: number; volumeScale?: number },
): Float32Array {
  const xyScale = options?.xyScale ?? 1;
  const zScale = options?.zScale ?? 0.65;
  const volumeScale = options?.volumeScale ?? 0;
  const out = new Float32Array(nodes.length * 3);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const sourceOffset = i * 2;
    const targetOffset = i * 3;
    const hasPosition = sourceOffset + 1 < positions2d.length;
    const x = hasPosition ? positions2d[sourceOffset] : 0.5;
    const y = hasPosition ? positions2d[sourceOffset + 1] : 0.5;
    const role = node.roles?.[0] || "no-role";
    const moduleName = node.modules?.[0] || "no-module";
    const project = node.projectId || "no-project";
    const identity = node.id || `${project}:${role}:${moduleName}`;
    const volumeX = (hashToUnit(`volume-x:${role}:${project}`) - 0.5) * volumeScale;
    const volumeY = (hashToUnit(`volume-y:${moduleName}:${project}`) - 0.5) * volumeScale;
    const volumeZ = (hashToUnit(`volume-z:${identity}`) - 0.5) * volumeScale * 0.8;
    out[targetOffset] = (x - 0.5) * xyScale + volumeX;
    out[targetOffset + 1] = (y - 0.5) * xyScale + volumeY;
    out[targetOffset + 2] = computeSemanticDepth(node) * zScale + volumeZ;
  }

  return out;
}

export function readGraphDisplayMode(
  getItem: (key: string) => string | null = (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
): GraphDisplayMode | null {
  try {
    const raw = getItem(GRAPH_DISPLAY_MODE_KEY);
    return raw === "2d" || raw === "3d" ? raw : null;
  } catch {
    return null;
  }
}

export function writeGraphDisplayMode(mode: GraphDisplayMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPH_DISPLAY_MODE_KEY, mode);
  } catch {
    /* ignore storage failures */
  }
}

export function selectInitialGraphBackend(
  savedMode: GraphDisplayMode | null,
  webgl2Available: boolean,
): GraphRendererBackend {
  if (!webgl2Available) return "canvas2d";
  return savedMode === "3d" ? "three3d" : "cosmos";
}

export function shouldInitializeLayoutWorker(
  backend: GraphRendererBackend,
  nodeCount: number,
): boolean {
  return nodeCount > 0 && backend !== "cosmos";
}

export function shouldRender3dEdges(options: {
  linkCount: number;
  isCameraMoving: boolean;
  isInteracting: boolean;
}): boolean {
  return options.linkCount > 0 && !options.isCameraMoving && !options.isInteracting;
}

export function get3dEdgeSampleStep(linkCount: number, maxEdges = ACC_GRAPH_3D_MAX_EDGES): number {
  if (linkCount <= 0 || maxEdges <= 0) return 1;
  return Math.max(1, Math.ceil(linkCount / maxEdges));
}
