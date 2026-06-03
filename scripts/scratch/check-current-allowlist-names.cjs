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
  console.log(`Allowlist count: ${rawAllowlist.length} project IDs.`);

  const dbProjects = await prisma.accProject.findMany({
    where: { id: { in: rawAllowlist } },
    select: { id: true, name: true }
  });

  console.log("Current projects in allowlist:");
  dbProjects.forEach((p, idx) => {
    console.log(`${idx + 1}. "${p.name}" (${p.id})`);
  });

  // Also search the entire database for any projects that DO contain mxl, tij, qro, cdmx, demo, vdc, test, templates
  const allProjects = await prisma.accProject.findMany({
    select: { id: true, name: true }
  });

  const suspiciousInAllowlist = [];
  for (const p of dbProjects) {
    const lowerName = p.name.toLowerCase();
    if (
      lowerName.includes("mxl") ||
      lowerName.includes("tij") ||
      lowerName.includes("qro") ||
      lowerName.includes("cdmx") ||
      lowerName.includes("demo") ||
      lowerName.includes("vdc") ||
      lowerName.includes("prueba") ||
      lowerName.includes("test") ||
      lowerName.includes("sandbox") ||
      lowerName.includes("template")
    ) {
      suspiciousInAllowlist.push(p);
    }
  }

  console.log("\nSuspicious projects STILL IN allowlist:", suspiciousInAllowlist.length);
  suspiciousInAllowlist.forEach(p => {
    console.log(`- "${p.name}" (${p.id})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
