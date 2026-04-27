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
  individualAccess: boolean;
}

export interface LayoutWeights {
  role: number;
  access: number;
  lastAdded: number;
  project: number;
  individualAccess: number;
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
  individualAccess: 42,
  userName: 30,
};

export const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = {
  attraction: 58,
  repulsion: 64,
  damping: 72,
  motion: 58,
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
  const maxWeight = Math.max(
    1,
    weights.role + weights.access + weights.lastAdded + weights.project + weights.individualAccess + weights.userName,
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const project = featureAnchor(node.projectName || node.projectId || "no-project", "project");
    const roles = averageFeatureAnchor(node.roles, "role");
    const access = node.isAdmin ? { x: -0.42, y: -0.28 } : { x: 0.32, y: 0.22 };
    const lastAddedAnchor = node.lastAddedBucket ? featureAnchor(node.lastAddedBucket, "lastAdded") : { x: 0, y: 0 };
    const individualAccessAnchor = node.individualAccess ? { x: -0.18, y: 0.35 } : { x: 0.18, y: -0.35 };
    const userNameAnchor = node.name ? featureAnchor(node.name.toLowerCase(), "userName") : { x: 0, y: 0 };
    const jitter = featureAnchor(node.id, "instance");

    let x = 0;
    let y = 0;
    let usedWeight = 0;

    if (weights.project > 0) {
      x += project.x * weights.project;
      y += project.y * weights.project;
      usedWeight += weights.project;
    }
    if (weights.role > 0 && roles.weight > 0) {
      x += roles.x * weights.role;
      y += roles.y * weights.role;
      usedWeight += weights.role;
    }
    if (weights.lastAdded > 0 && node.lastAddedBucket) {
      x += lastAddedAnchor.x * weights.lastAdded;
      y += lastAddedAnchor.y * weights.lastAdded;
      usedWeight += weights.lastAdded;
    }
    if (weights.access > 0) {
      x += access.x * weights.access;
      y += access.y * weights.access;
      usedWeight += weights.access;
    }
    if (weights.individualAccess > 0) {
      x += individualAccessAnchor.x * weights.individualAccess;
      y += individualAccessAnchor.y * weights.individualAccess;
      usedWeight += weights.individualAccess;
    }
    if (weights.userName > 0 && node.name) {
      x += userNameAnchor.x * weights.userName;
      y += userNameAnchor.y * weights.userName;
      usedWeight += weights.userName;
    }

    const normalizer = Math.max(1, Math.min(maxWeight, usedWeight));
    positions[i * 2] = 0.5 + x / normalizer + jitter.x * 0.08;
    positions[i * 2 + 1] = 0.5 + y / normalizer + jitter.y * 0.08;
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
    addHashedFeature(
      vectors,
      offset,
      node.individualAccess ? "individual-access:configured" : "individual-access:bare",
      weights.individualAccess,
    );

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
