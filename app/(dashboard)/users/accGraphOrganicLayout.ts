"use client";

export interface OrganicLayoutNode {
  id: string;
  email: string;
  name: string;
  projectId?: string;
  projectName?: string;
  isAdmin: boolean;
  roles: string[];
  lastAddedBucket: string;
  modules: string[];
}

export interface LayoutWeights {
  role: number;
  access: number;
  lastAdded: number;
  project: number;
  modules: number;
  userName: number;
}

export interface PhysicsSettings {
  attraction: number;
  repulsion: number;
  damping: number;
  motion: number;
}

export const DEFAULT_LAYOUT_WEIGHTS: LayoutWeights = {
  role: 72,
  access: 38,
  lastAdded: 45,
  project: 68,
  modules: 42,
  userName: 30,
};

export const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = {
  attraction: 45,
  repulsion: 50,
  damping: 20,
  motion: 45,
};

export const SEMANTIC_VECTOR_SIZE = 48;

function hashU32(value: string, salt = ""): number {
  let hash = 2166136261;
  const input = `${salt}:${value}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash01(value: string, salt = ""): number {
  return (hashU32(value, salt) % 100000) / 100000;
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

export function normalizePositions(positions: Float32Array): Float32Array {
  if (!positions.length) return positions;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length / 2; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const maxRange = Math.max(rangeX, rangeY);
  const offsetX = (maxRange - rangeX) / 2;
  const offsetY = (maxRange - rangeY) / 2;

  for (let i = 0; i < positions.length / 2; i++) {
    positions[i * 2] = 0.05 + ((positions[i * 2] - minX + offsetX) / maxRange) * 0.9;
    positions[i * 2 + 1] = 0.05 + ((positions[i * 2 + 1] - minY + offsetY) / maxRange) * 0.9;
  }
  return positions;
}

export function computeCentroid(positions: Float32Array): { x: number; y: number } {
  if (positions.length < 2) return { x: 0.5, y: 0.5 };
  let x = 0;
  let y = 0;
  const count = positions.length / 2;
  for (let i = 0; i < count; i++) {
    x += positions[i * 2];
    y += positions[i * 2 + 1];
  }
  return { x: x / count, y: y / count };
}

export function computeSemanticSeedPositions(nodes: readonly OrganicLayoutNode[], weights: LayoutWeights): Float32Array {
  const positions = new Float32Array(nodes.length * 2);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    // Each slider is scaled to [0,1] and contributes independently — no normalizer divide.
    // Slider 0 → zero contribution; slider 100 → full anchor contribution.
    // normalizePositions() maps the result to [0.05,0.95] so absolute scale doesn't matter.
    const wp = weights.project / 100;
    const wr = weights.role / 100;
    const wa = weights.access / 100;
    const wl = weights.lastAdded / 100;
    const wm = weights.modules / 100;
    const wu = weights.userName / 100;

    const project = featureAnchor(node.projectName || node.projectId || "no-project", "project");
    const roles = averageFeatureAnchor(node.roles, "role");
    const access = node.isAdmin ? { x: -0.45, y: -0.30 } : { x: 0.40, y: 0.26 };
    const lastAddedAnchor = node.lastAddedBucket ? featureAnchor(node.lastAddedBucket, "lastAdded") : { x: 0, y: 0 };
    const modulesAnchor = averageFeatureAnchor(node.modules ?? [], "module");
    const userNameAnchor = node.name ? featureAnchor(node.name.toLowerCase(), "userName") : { x: 0, y: 0 };
    const jitter = featureAnchor(node.id, "instance");

    let x = project.x * wp + access.x * wa;
    let y = project.y * wp + access.y * wa;

    if (roles.weight > 0) { x += roles.x * wr; y += roles.y * wr; }
    if (node.lastAddedBucket) { x += lastAddedAnchor.x * wl; y += lastAddedAnchor.y * wl; }
    if (modulesAnchor.weight > 0) { x += modulesAnchor.x * wm; y += modulesAnchor.y * wm; }
    if (node.name) { x += userNameAnchor.x * wu; y += userNameAnchor.y * wu; }

    positions[i * 2] = 0.5 + x + jitter.x * 0.05;
    positions[i * 2 + 1] = 0.5 + y + jitter.y * 0.05;
  }

  return normalizePositions(positions);
}

function addHashedFeature(vector: Float32Array, offset: number, value: string, weight: number): void {
  if (!value || weight <= 0) return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  const hash = hashU32(normalized, "semantic-vector");
  const index = offset + (hash % SEMANTIC_VECTOR_SIZE);
  const sign = (hash & 0x80000000) === 0 ? 1 : -1;
  vector[index] += sign * weight;
}

function addTextFeatures(vector: Float32Array, offset: number, value: string | undefined, weight: number, salt: string): void {
  if (!value || weight <= 0) return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  addHashedFeature(vector, offset, `${salt}:full:${normalized}`, weight);
  for (const token of normalized.split(/[^a-z0-9]+/i)) {
    if (token.length >= 2) addHashedFeature(vector, offset, `${salt}:token:${token}`, weight * 0.55);
  }
}

export function computeSemanticVectors(
  nodes: readonly OrganicLayoutNode[],
  weights: LayoutWeights,
): { vectors: Float32Array; vectorSize: number } {
  const vectors = new Float32Array(nodes.length * SEMANTIC_VECTOR_SIZE);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const offset = i * SEMANTIC_VECTOR_SIZE;

    addTextFeatures(vectors, offset, node.name, weights.userName, "name");
    addTextFeatures(vectors, offset, node.projectName || node.projectId, weights.project, "project");
    for (const role of node.roles) {
      addTextFeatures(vectors, offset, role, weights.role, "role");
    }
    addHashedFeature(vectors, offset, node.isAdmin ? "access:admin" : "access:member", weights.access);
    addHashedFeature(vectors, offset, `last-added:${node.lastAddedBucket || "unknown"}`, weights.lastAdded);
    for (const mod of node.modules ?? []) {
      addTextFeatures(vectors, offset, mod, weights.modules, "module");
    }

    let magnitude = 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      const value = vectors[offset + j];
      magnitude += value * value;
    }
    const scale = magnitude > 0 ? 1 / Math.sqrt(magnitude) : 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      vectors[offset + j] *= scale;
    }
  }

  return { vectors, vectorSize: SEMANTIC_VECTOR_SIZE };
}
