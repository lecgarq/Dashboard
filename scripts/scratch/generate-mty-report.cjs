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
    where: { id: { in: rawAllowlist } },
    select: { id: true, name: true }
  });

  // Sort projects alphabetically by name
  dbProjects.sort((a, b) => a.name.localeCompare(b.name));

  let md = "# Monterrey (MTY) Projects Allowlist Audit Report\n\n";
  md += `Total projects in allowlist: **${dbProjects.length}**\n\n`;
  md += "| # | Project Name | Project ID | Contains Division/Test Keywords? |\n";
  md += "|---|--------------|------------|-----------------------------------|\n";

  let suspiciousCount = 0;

  dbProjects.forEach((p, idx) => {
    const lowerName = p.name.toLowerCase();
    const keywords = [];
    if (lowerName.includes("mxl")) keywords.push("mxl");
    if (lowerName.includes("tij")) keywords.push("tij");
    if (lowerName.includes("qro")) keywords.push("qro");
    if (lowerName.includes("cdmx")) keywords.push("cdmx");
    if (lowerName.includes("demo")) keywords.push("demo");
    if (lowerName.includes("vdc")) keywords.push("vdc");
    if (lowerName.includes("prueba")) keywords.push("prueba");
    if (lowerName.includes("test")) keywords.push("test");
    if (lowerName.includes("sandbox")) keywords.push("sandbox");
    if (lowerName.includes("template")) keywords.push("template");

    let status = "None";
    if (keywords.length > 0) {
      status = `⚠️ Yes (${keywords.join(", ")})`;
      suspiciousCount++;
    }

    md += `| ${idx + 1} | ${p.name} | \`${p.id}\` | ${status} |\n`;
  });

  md += `\nTotal suspicious projects: **${suspiciousCount}**\n`;

  const outputPath = path.resolve(__dirname, "..", "..", "docs", "mty-projects-allowlist-audit.md");
  fs.writeFileSync(outputPath, md);
  console.log(`Wrote audit report to: ${outputPath}`);
  console.log(`Total projects in allowlist: ${dbProjects.length}`);
  console.log(`Total suspicious: ${suspiciousCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
