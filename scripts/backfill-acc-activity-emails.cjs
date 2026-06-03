#!/usr/bin/env node

require("tsx/cjs");

const {
  buildUniqueAutodeskEmailMap,
  mergeAttributionMaps,
} = require("../lib/acc/activityAttribution.ts");

const dotenv = (() => {
  try {
    return require("dotenv");
  } catch {
    return null;
  }
})();
if (dotenv) dotenv.config();

const DRY_RUN = process.env.ACTIVITY_ATTRIBUTION_DRY_RUN === "1";
const REPORT_LIMIT = Number.parseInt(process.env.ACTIVITY_ATTRIBUTION_REPORT_LIMIT || "25", 10);

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });
}

async function fetchDcUserMap(prisma) {
  const rows = await prisma.accDcUser.findMany({
    where: {
      autodeskId: { not: null },
      email: { not: null },
    },
    select: { autodeskId: true, email: true },
  });
  return buildUniqueAutodeskEmailMap(rows);
}

async function fetchProjectMemberMap(prisma) {
  const rows = await prisma.accProjectMember.findMany({
    select: { autodeskId: true, email: true },
  });
  return buildUniqueAutodeskEmailMap(rows);
}

async function fetchCacheUserMap(prisma) {
  const rows = await prisma.accMemberCache.findMany({
    select: { email: true, data: true },
  });
  return buildUniqueAutodeskEmailMap(
    rows.map((row) => ({
      autodeskId:
        row.data && typeof row.data === "object" && typeof row.data.autodeskId === "string"
          ? row.data.autodeskId
          : null,
      email: row.email,
    })),
  );
}

async function getAttributionCounts(prisma) {
  const [totalActivityRows, attributedActivityRows, distinctUnattributedActors] = await Promise.all([
    prisma.accActivity.count(),
    prisma.accActivity.count({ where: { userEmail: { not: null } } }),
    prisma.accActivity.findMany({
      where: { userEmail: null },
      distinct: ["autodeskId"],
      select: { autodeskId: true },
    }),
  ]);
  return {
    totalActivityRows,
    attributedActivityRows,
    unattributedActivityRows: totalActivityRows - attributedActivityRows,
    distinctUnattributedActors: distinctUnattributedActors.length,
  };
}

async function applyAttribution(prisma, emailsById) {
  const ids = await prisma.accActivity.findMany({
    where: { userEmail: null },
    distinct: ["autodeskId"],
    select: { autodeskId: true },
  });

  let updated = 0;
  let matchedActors = 0;
  for (const { autodeskId } of ids) {
    const email = emailsById.get(autodeskId);
    if (!email) continue;
    matchedActors += 1;
    if (DRY_RUN) {
      const rows = await prisma.accActivity.count({ where: { autodeskId, userEmail: null } });
      updated += rows;
      continue;
    }
    const result = await prisma.accActivity.updateMany({
      where: { autodeskId, userEmail: null },
      data: { userEmail: email },
    });
    updated += result.count;
  }

  return {
    matchedActors,
    updatedRows: updated,
    unmatchedActorsBeforeUpdate: ids.length - matchedActors,
  };
}

async function loadUnknownActorReport(prisma, limit) {
  return prisma.$queryRawUnsafe(
    `
    SELECT
      a."autodeskId",
      COUNT(*)::int AS rows,
      MIN(a."createdAt") AS "firstSeen",
      MAX(a."createdAt") AS "lastSeen",
      array_agg(DISTINCT a.service) FILTER (WHERE a.service IS NOT NULL) AS services,
      array_agg(DISTINCT a."rawAction") AS actions,
      COUNT(DISTINCT NULLIF(a."projectId", ''))::int AS "projectCount"
    FROM "AccActivity" a
    WHERE a."userEmail" IS NULL
    GROUP BY a."autodeskId"
    ORDER BY rows DESC, a."autodeskId" ASC
    LIMIT $1
    `,
    limit,
  );
}

async function main() {
  const prisma = createPrisma();
  try {
    const before = await getAttributionCounts(prisma);
    console.log("[activity-backfill] before", JSON.stringify(before));

    const [dcMap, projectMemberMap, cacheMap] = await Promise.all([
      fetchDcUserMap(prisma),
      fetchProjectMemberMap(prisma),
      fetchCacheUserMap(prisma),
    ]);
    const merged = mergeAttributionMaps([dcMap, projectMemberMap, cacheMap]);
    console.log(
      "[activity-backfill] local user ids available",
      JSON.stringify({
        dc: dcMap.emailsById.size,
        projectMembers: projectMemberMap.emailsById.size,
        cache: cacheMap.emailsById.size,
        merged: merged.emailsById.size,
        ambiguousIds: merged.ambiguousIds.size,
        dryRun: DRY_RUN,
      }),
    );

    const applied = await applyAttribution(prisma, merged.emailsById);
    const after = await getAttributionCounts(prisma);
    const unknownActors = await loadUnknownActorReport(prisma, REPORT_LIMIT);

    console.log(
      JSON.stringify(
        {
          dryRun: DRY_RUN,
          applied,
          before,
          after,
          improvement: {
            newlyAttributedRows: after.attributedActivityRows - before.attributedActivityRows,
            remainingUnattributedRows: after.unattributedActivityRows,
            remainingUnattributedActors: after.distinctUnattributedActors,
          },
          unknownActors,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[activity-backfill] ERROR:", error.message || error);
  process.exit(1);
});
