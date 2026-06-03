#!/usr/bin/env node
/**
 * scripts/scratch/filter-mty-allowlist.cjs
 *
 * Refines the Monterrey projects allowlist by excluding projects that contain:
 * - MXL, TIJ, QRO, CDMX (other divisions)
 * - DEMO, VDC (non-production/testing)
 */

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
  console.log("=== REFINING MONTERREY PROJECTS ALLOWLIST ===\n");

  const mtyAllowlistPath = path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json");
  const rawAllowlist = require(mtyAllowlistPath);
  console.log(`Original Allowlist count: ${rawAllowlist.length} project IDs.`);

  // Load all projects from DB to get their names
  const dbProjects = await prisma.accProject.findMany({
    select: { id: true, name: true }
  });
  const projectMap = new Map(dbProjects.map(p => [p.id, p.name]));

  const filteredAllowlist = [];
  const excluded = [];

  for (const id of rawAllowlist) {
    const name = projectMap.get(id);
    if (!name) {
      // If we don't have the name, keep it or skip? Keep it by default just in case, but let's check
      filteredAllowlist.push(id);
      continue;
    }

    const lowerName = name.toLowerCase();

    // Exclude MXL, TIJ, QRO, CDMX
    const hasOtherDivision = /\b(mxl|tij|qro|cdmx)\b/i.test(lowerName) || 
                             lowerName.includes("mxl") || 
                             lowerName.includes("tij") || 
                             lowerName.includes("qro") || 
                             lowerName.includes("cdmx");

    // Exclude DEMO, VDC
    const isDemoOrVdc = /\b(demo|vdc)\b/i.test(lowerName) ||
                        lowerName.includes("demo") ||
                        lowerName.includes("vdc") ||
                        lowerName.includes("prueba") ||
                        lowerName.includes("test") ||
                        lowerName.includes("sandbox") ||
                        lowerName.includes("template");

    if (hasOtherDivision || isDemoOrVdc) {
      let reason = "";
      if (hasOtherDivision) reason += "other division (MXL/TIJ/QRO/CDMX)";
      if (isDemoOrVdc) reason += (reason ? " & " : "") + "demo/vdc/test";
      excluded.push({ name, id, reason });
    } else {
      filteredAllowlist.push(id);
    }
  }

  console.log(`Excluded ${excluded.length} projects:`);
  excluded.forEach((p, idx) => {
    console.log(`  ${idx + 1}. "${p.name}" (${p.id}) -> Reason: ${p.reason}`);
  });

  console.log(`\nNew Allowlist Count: ${filteredAllowlist.length} project IDs.`);

  // Write new allowlist
  fs.writeFileSync(mtyAllowlistPath, JSON.stringify(filteredAllowlist, null, 2));
  console.log(`Updated lib/acc/mty-allowlist.json successfully!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
