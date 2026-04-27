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

function clampUnit(value: number): number {
  return Math.max(0.04, Math.min(0.96, value));
}

function weight01(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}

function neutralPackAnchor(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const t = (index + 0.5) / count;
  const radius = Math.sqrt(t) * 0.13;
  const angle = index * goldenAngle;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
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
  const wp = weight01(weights.project);
  const wr = weight01(weights.role);
  const wa = weight01(weights.access);
  const wl = weight01(weights.lastAdded);
  const wm = weight01(weights.modules);
  const wu = weight01(weights.userName);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    const project = featureAnchor(node.projectName || node.projectId || "no-project", "project");
    const roles = averageFeatureAnchor(node.roles, "role");
    const access = node.isAdmin ? { x: -0.45, y: -0.30 } : { x: 0.40, y: 0.26 };
    const lastAddedAnchor = node.lastAddedBucket ? featureAnchor(node.lastAddedBucket, "lastAdded") : { x: 0, y: 0 };
    const modulesAnchor = averageFeatureAnchor(node.modules ?? [], "module");
    const userNameAnchor = node.name ? featureAnchor(node.name.toLowerCase(), "userName") : { x: 0, y: 0 };
    const compact = neutralPackAnchor(i, nodes.length);
    const jitter = featureAnchor(node.id, "instance");

    let x = 0;
    let y = 0;
    let semanticWeight = 0;
    const addAnchor = (anchor: { x: number; y: number }, weight: number) => {
      if (weight <= 0) return;
      x += anchor.x * weight;
      y += anchor.y * weight;
      semanticWeight += weight;
    };

    addAnchor(project, wp);
    addAnchor(access, wa);
    if (roles.weight > 0) addAnchor(roles, wr);
    if (node.lastAddedBucket) addAnchor(lastAddedAnchor, wl);
    if (modulesAnchor.weight > 0) addAnchor(modulesAnchor, wm);
    if (node.name) addAnchor(userNameAnchor, wu);

    if (semanticWeight < 0.01) {
      positions[i * 2] = clampUnit(0.5 + compact.x + jitter.x * 0.012);
      positions[i * 2 + 1] = clampUnit(0.5 + compact.y + jitter.y * 0.012);
      continue;
    }

    const influence = Math.min(1, semanticWeight);
    const anchorX = (x / semanticWeight) * 0.86;
    const anchorY = (y / semanticWeight) * 0.86;
    positions[i * 2] = clampUnit(0.5 + compact.x * (1 - influence) + anchorX * influence + jitter.x * 0.014);
    positions[i * 2 + 1] = clampUnit(0.5 + compact.y * (1 - influence) + anchorY * influence + jitter.y * 0.014);
  }

  return positions;
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
  const normalizedWeights = {
    role: weight01(weights.role),
    access: weight01(weights.access),
    lastAdded: weight01(weights.lastAdded),
    project: weight01(weights.project),
    modules: weight01(weights.modules),
    userName: weight01(weights.userName),
  };
  const vectorInfluence = Math.min(
    1,
    normalizedWeights.role +
      normalizedWeights.access +
      normalizedWeights.lastAdded +
      normalizedWeights.project +
      normalizedWeights.modules +
      normalizedWeights.userName,
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const offset = i * SEMANTIC_VECTOR_SIZE;

    addTextFeatures(vectors, offset, node.name, normalizedWeights.userName, "name");
    addTextFeatures(vectors, offset, node.projectName || node.projectId, normalizedWeights.project, "project");
    for (const role of node.roles) {
      addTextFeatures(vectors, offset, role, normalizedWeights.role, "role");
    }
    addHashedFeature(vectors, offset, node.isAdmin ? "access:admin" : "access:member", normalizedWeights.access);
    addHashedFeature(vectors, offset, `last-added:${node.lastAddedBucket || "unknown"}`, normalizedWeights.lastAdded);
    for (const mod of node.modules ?? []) {
      addTextFeatures(vectors, offset, mod, normalizedWeights.modules, "module");
    }

    let magnitude = 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      const value = vectors[offset + j];
      magnitude += value * value;
    }
    const scale = magnitude > 0 ? 1 / Math.sqrt(magnitude) : 0;
    for (let j = 0; j < SEMANTIC_VECTOR_SIZE; j++) {
      vectors[offset + j] *= scale * vectorInfluence;
    }
  }

  return { vectors, vectorSize: SEMANTIC_VECTOR_SIZE };
}
