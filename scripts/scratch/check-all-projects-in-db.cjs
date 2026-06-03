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

  console.log(`Allowlist currently has ${allowlistSet.size} items.`);

  const dbProjects = await prisma.accProject.findMany({
    select: { id: true, name: true }
  });

  console.log(`Total projects in DB: ${dbProjects.length}`);

  const matches = [];
  for (const p of dbProjects) {
    const lowerName = p.name.toLowerCase();
    
    // Check if name has MXL, TIJ, QRO, CDMX, DEMO, VDC (including cases like templ, test, etc.)
    const hasExclusions = 
      lowerName.includes("mxl") ||
      lowerName.includes("tij") ||
      lowerName.includes("qro") ||
      lowerName.includes("cdmx") ||
      lowerName.includes("demo") ||
      lowerName.includes("vdc") ||
      lowerName.includes("prueba") ||
      lowerName.includes("test") ||
      lowerName.includes("sandbox") ||
      lowerName.includes("template");

    if (hasExclusions) {
      const inAllowlist = allowlistSet.has(p.id);
      matches.push({ id: p.id, name: p.name, inAllowlist });
    }
  }

  console.log(`\nProjects with exclusions in their name: ${matches.length}`);
  const inAllowlistCount = matches.filter(m => m.inAllowlist).length;
  console.log(`Of these, ${inAllowlistCount} are currently in the allowlist!`);

  matches.forEach((m, idx) => {
    console.log(`${idx + 1}. [In Allowlist: ${m.inAllowlist ? "YES" : "NO"}] "${m.name}" (${m.id})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
