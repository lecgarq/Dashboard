#!/usr/bin/env node
require("dotenv").config();
const path = require("node:path");
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function main() {
  const mtyAllowlistPath = path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json");
  const rawAllowlist = require(mtyAllowlistPath);
  const allowlistSet = new Set(rawAllowlist);

  const dbProjects = await prisma.accProject.findMany({
    select: { id: true, name: true }
  });
  const dbProjectIds = new Set(dbProjects.map(p => p.id));

  const missing = [];
  for (const id of rawAllowlist) {
    if (!dbProjectIds.has(id)) {
      missing.push(id);
    }
  }

  console.log(`Allowlist items: ${rawAllowlist.length}`);
  console.log(`Exist in DB: ${dbProjects.length}`);
  console.log(`Missing from DB: ${missing.length}`);
  if (missing.length > 0) {
    console.log("Missing IDs:");
    missing.forEach(id => console.log(`- ${id}`));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
