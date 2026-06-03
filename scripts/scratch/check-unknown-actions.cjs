#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const path = require("node:path");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const { classifyActivity } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "activityCategories.ts"));

    const actions = await prisma.accActivity.groupBy({
      by: ["rawAction", "service"],
      _count: { id: true },
    });

    // Classify them
    const mapped = actions.map((item) => {
      const classification = classifyActivity(item.rawAction, item.service);
      return {
        rawAction: item.rawAction,
        serviceInDb: item.service,
        count: item._count.id,
        classification,
      };
    });

    // Group by category, service, and see which ones are "unknown" or "other"
    const unmapped = mapped.filter(
      (item) =>
        item.classification.domain === "unknown" ||
        item.classification.category === "other" ||
        item.classification.confidence === "unknown"
    );

    unmapped.sort((a, b) => b.count - a.count);

    console.log("=== TOP 30 UNMAPPED OR UNKNOWN ACTIONS ===");
    unmapped.slice(0, 30).forEach((item, idx) => {
      console.log(`${idx + 1}. rawAction: "${item.rawAction}" (Service in DB: "${item.serviceInDb || "null"}")`);
      console.log(`   Count: ${item.count.toLocaleString()}`);
      console.log(`   Classification: domain="${item.classification.domain}", category="${item.classification.category}", confidence="${item.classification.confidence}"`);
      console.log("-----------------------------------------");
    });

    const totalUnmappedCount = unmapped.reduce((a, b) => a + b.count, 0);
    console.log(`Total unmapped activity count: ${totalUnmappedCount.toLocaleString()}`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
