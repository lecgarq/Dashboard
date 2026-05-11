/**
 * Standalone ACC graph cache rebuild — invoked by Railway release command
 * after Quick Sync. Reads AccMemberCache, runs the layout simulation, writes
 * AccGraphLayoutCache. Same logic the in-app `rebuildAccGraphCache` mutation
 * runs; extracted to a shared module so this entry can call it via tsx.
 *
 * Exit codes:
 *   0 — rebuild succeeded (or AccMemberCache empty — nothing to build)
 *   1 — rebuild failed (release.cjs decides whether to fail the deploy)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebuildAccGraphCache } from "../lib/server/graph-rebuild";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — matches Quick Sync ceiling

function createPrisma(): PrismaClient {
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error"] }) as unknown as PrismaClient;
}

async function main() {
  const start = Date.now();
  console.log(`[rebuild-graph] Starting ACC graph cache rebuild...`);

  const prisma = createPrisma();
  const timer = setTimeout(() => {
    console.error(`[rebuild-graph] Timed out after ${TIMEOUT_MS / 1000}s. Aborting.`);
    process.exit(1);
  }, TIMEOUT_MS);

  try {
    const memberCount = await (prisma as any).accMemberCache.count();
    if (memberCount === 0) {
      console.log(`[rebuild-graph] AccMemberCache is empty — skipping rebuild (Phase 2 will populate it).`);
      clearTimeout(timer);
      return;
    }

    const result = await rebuildAccGraphCache(prisma);
    clearTimeout(timer);

    const durationMs = Date.now() - start;
    console.log(
      `[rebuild-graph] Rebuilt graph cache in ${durationMs}ms: ` +
        `${result.stats.nodeCount} nodes, ${result.stats.edgeCount} edges, ` +
        `${result.stats.totalProjectInstances} project-slots.`,
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[rebuild-graph] Failed:`, message);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
