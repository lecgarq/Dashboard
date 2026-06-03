#!/usr/bin/env node
/**
 * scripts/scratch/check-creation-dates.cjs
 *
 * Checks how far back the Autodesk creation dates ("all time" floors) go for MTY projects.
 */

require("dotenv").config();
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function main() {
  console.log("=== MONTERREY PROJECTS FLOOR CENSUS (ALL TIME FLOORS) ===\n");

  const mtyAllowlist = require(path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json"));
  const mtySet = new Set(mtyAllowlist);

  const backfills = await prisma.accDcBackfillProgress.findMany();
  const dbProjects = await prisma.accProject.findMany({ select: { id: true, name: true } });
  const nameById = new Map(dbProjects.map(p => [p.id, p.name]));

  const mtyBackfills = backfills.filter(b => mtySet.has(b.projectId));
  console.log(`Tracked MTY projects in progress table: ${mtyBackfills.length}\n`);

  mtyBackfills.sort((a, b) => a.projectCreatedAt.getTime() - b.projectCreatedAt.getTime());

  console.log("PROJECT CREATION FLOOR (OLDEST FIRST):");
  mtyBackfills.forEach((b, idx) => {
    console.log(`${idx + 1}. "${nameById.get(b.projectId) || b.projectId}"`);
    console.log(`   Creation Floor (All Time Floor): ${b.projectCreatedAt.toISOString().split("T")[0]}`);
    console.log(`   Currently Covered Range        : ${b.earliestCovered ? b.earliestCovered.toISOString().split("T")[0] : "none"} to ${b.latestCovered ? b.latestCovered.toISOString().split("T")[0] : "none"}`);
    console.log("---------------------------------------------------------");
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
