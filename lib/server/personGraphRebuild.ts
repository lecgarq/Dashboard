import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { buildPersonFeatures } from "@/lib/acc/embedding/buildPersonFeatures";
import { buildSnapshotsFromBags } from "@/lib/acc/embedding/buildSnapshots";

export const PERSON_GRAPH_KS = [6, 8, 10, 12, 14, 16];

export async function rebuildPersonGraph(
  db: PrismaClient
): Promise<{ ks: number[]; personCount: number }> {
  const bags = await buildPersonFeatures(db);
  const snaps = buildSnapshotsFromBags(bags, PERSON_GRAPH_KS);
  const dataHash = createHash("sha1")
    .update(`${bags.length}:${snaps[0]?.dim ?? 0}`)
    .digest("hex")
    .slice(0, 12);

  for (const s of snaps) {
    await db.accPersonGraphSnapshot.upsert({
      where: { k: s.k },
      create: {
        k: s.k,
        dataHash,
        personCount: s.personCount,
        edgeCount: s.edges.length,
        dim: s.dim,
        nodes: s.nodes as unknown as Prisma.InputJsonValue,
        nodes3d: s.nodes3d as unknown as Prisma.InputJsonValue,
        edges: s.edges as unknown as Prisma.InputJsonValue,
        clusters: s.clusters as unknown as Prisma.InputJsonValue,
      },
      update: {
        dataHash,
        personCount: s.personCount,
        edgeCount: s.edges.length,
        dim: s.dim,
        nodes: s.nodes as unknown as Prisma.InputJsonValue,
        nodes3d: s.nodes3d as unknown as Prisma.InputJsonValue,
        edges: s.edges as unknown as Prisma.InputJsonValue,
        clusters: s.clusters as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return { ks: PERSON_GRAPH_KS, personCount: bags.length };
}
