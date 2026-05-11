import { Prisma } from "@prisma/client";
import { runSimulation, type PhysicsEdge, type PhysicsNode } from "@/lib/acc/graphSimulation";
import {
  buildAccGraphSnapshot,
  normalizeAccGraphPositions,
  type AccGraphNode,
} from "@/lib/acc/graphSnapshot";

export const ACC_GRAPH_CACHE_ID = "singleton";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeGraphNodes(nodes: AccGraphNode[], fallbackNodes: readonly AccGraphNode[]) {
  let usedFallback = false;
  const safeNodes = nodes.map((node, index) => {
    const fallback = fallbackNodes[index] ?? node;
    const x = isFiniteNumber(node.x) ? node.x : fallback.x;
    const y = isFiniteNumber(node.y) ? node.y : fallback.y;
    const vx = isFiniteNumber(node.vx) ? node.vx : fallback.vx;
    const vy = isFiniteNumber(node.vy) ? node.vy : fallback.vy;
    usedFallback ||= x !== node.x || y !== node.y || vx !== node.vx || vy !== node.vy;
    return { ...node, x, y, vx, vy };
  });
  return { safeNodes, usedFallback };
}

export function sanitizeGraphPositions(rawPositions: unknown, fallbackPositions: number[]) {
  if (!Array.isArray(rawPositions) || rawPositions.length !== fallbackPositions.length) {
    return { safePositions: fallbackPositions, usedFallback: true };
  }

  let usedFallback = false;
  const safePositions = rawPositions.map((value, index) => {
    if (isFiniteNumber(value)) return value;
    usedFallback = true;
    return fallbackPositions[index];
  });

  return { safePositions, usedFallback };
}

export async function rebuildAccGraphCache(db: any) {
  const rows = await db.accMemberCache.findMany({ orderBy: { email: "asc" } });
  const snapshot = buildAccGraphSnapshot(rows);
  const physicsNodes: PhysicsNode[] = snapshot.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    vx: node.vx,
    vy: node.vy,
  }));
  const physicsEdges: PhysicsEdge[] = snapshot.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
  }));
  const settled = runSimulation(physicsNodes, physicsEdges);
  const settledById = new Map(settled.map((node) => [node.id, node]));
  const nodes = snapshot.nodes.map((node) => {
    const settledNode = settledById.get(node.id);
    return settledNode
      ? { ...node, x: settledNode.x, y: settledNode.y, vx: settledNode.vx, vy: settledNode.vy }
      : node;
  });
  const fallbackPositions = normalizeAccGraphPositions(snapshot.nodes);
  const { safeNodes, usedFallback: usedNodeFallback } = sanitizeGraphNodes(nodes, snapshot.nodes);
  const { safePositions: positions, usedFallback: usedPositionFallback } = sanitizeGraphPositions(
    normalizeAccGraphPositions(safeNodes),
    fallbackPositions,
  );

  if (usedNodeFallback || usedPositionFallback) {
    console.warn(
      "[graph-rebuild] ACC graph cache rebuild produced invalid numeric values; falling back to semantic seed positions",
      { usedNodeFallback, usedPositionFallback, nodeCount: snapshot.stats.nodeCount },
    );
  }

  await db.accGraphLayoutCache.upsert({
    where: { id: ACC_GRAPH_CACHE_ID },
    create: {
      id: ACC_GRAPH_CACHE_ID,
      nodes: safeNodes as unknown as Prisma.InputJsonValue,
      edges: snapshot.edges as unknown as Prisma.InputJsonValue,
      positions,
      dataHash: snapshot.dataHash,
      nodeCount: snapshot.stats.nodeCount,
      edgeCount: snapshot.stats.edgeCount,
      instanceCount: snapshot.stats.totalProjectInstances,
      projectCount: snapshot.stats.uniqueProjects,
      nodeIds: snapshot.nodeIds,
    },
    update: {
      nodes: safeNodes as unknown as Prisma.InputJsonValue,
      edges: snapshot.edges as unknown as Prisma.InputJsonValue,
      positions,
      dataHash: snapshot.dataHash,
      nodeCount: snapshot.stats.nodeCount,
      edgeCount: snapshot.stats.edgeCount,
      instanceCount: snapshot.stats.totalProjectInstances,
      projectCount: snapshot.stats.uniqueProjects,
      nodeIds: snapshot.nodeIds,
    },
  });

  return { ...snapshot, nodes: safeNodes, positions };
}
