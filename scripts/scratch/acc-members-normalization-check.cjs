#!/usr/bin/env node
/**
 * scripts/scratch/acc-members-normalization-check.cjs
 *
 * Checks, extracts, and summarizes normalized roles, companies, product/module access,
 * and user additions (chronological audit) from AccMemberCache and AccDc snapshot tables.
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("==========================================================================");
    console.log("             LECG / HERMOSILLO ACC DIRECTORY SCHEMA NORMALIZATION STATUS   ");
    console.log("==========================================================================\n");

    // ==========================================================================
    // 1. UNIQUE ROLES INDEX
    // ==========================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🌐 [SECTION 1] NORMALIZED PROJECT ROLES & MEMBER COUNTS");
    console.log("--------------------------------------------------------------------------");

    // Pull from AccMemberCache
    const members = await prisma.$queryRaw`
      SELECT data FROM "AccMemberCache" WHERE data IS NOT NULL
    `;

    const rolesCount = {};
    const companyCounts = {};
    const moduleCounts = {};
    const addedOnDates = [];

    members.forEach(row => {
      const d = row.data || {};
      
      // Extract Company Role
      const r = d.companyRole;
      if (r) rolesCount[r] = (rolesCount[r] || 0) + 1;

      // Extract Company Name
      const c = d.company;
      if (c) companyCounts[c] = (companyCounts[c] || 0) + 1;

      // Extract Module Access
      if (Array.isArray(d.projects)) {
        d.projects.forEach(p => {
          if (Array.isArray(p.modules)) {
            p.modules.forEach(m => {
              moduleCounts[m] = (moduleCounts[m] || 0) + 1;
            });
          }
        });
      }

      // Extract addedOn Date
      if (d.addedOn) {
        addedOnDates.push(new Date(d.addedOn));
      }
    });

    const uniqueRoles = Object.keys(rolesCount);
    console.log(`Total Unique Roles Registered on Hub : ${uniqueRoles.length}`);
    console.log("\nTop 10 Active Roles:");
    Object.keys(rolesCount)
      .sort((a, b) => rolesCount[b] - rolesCount[a])
      .slice(0, 10)
      .forEach((r, idx) => {
        console.log(`  #${idx + 1}. Role: "${r.padEnd(28)}" | Members: ${rolesCount[r]}`);
      });

    // ==========================================================================
    // 2. UNIQUE COMPANIES INDEX
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🏢 [SECTION 2] NORMALIZED COMPANIES DIRECTORY");
    console.log("--------------------------------------------------------------------------");

    const uniqueCompanies = Object.keys(companyCounts);
    console.log(`Total Unique Companies Registered    : ${uniqueCompanies.length}`);
    console.log("\nTop 10 Active Companies:");
    Object.keys(companyCounts)
      .sort((a, b) => companyCounts[b] - companyCounts[a])
      .slice(0, 10)
      .forEach((c, idx) => {
        console.log(`  #${idx + 1}. Company: "${c.padEnd(28)}" | Members: ${companyCounts[c]}`);
      });

    // ==========================================================================
    // 3. PRODUCT & MODULE ACCESS SEGMENTATION
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⚙️ [SECTION 3] PRODUCT / MODULE ACCESS DISTRIBUTION");
    console.log("--------------------------------------------------------------------------");

    console.log("Normalized Module Access across project assignments:");
    Object.keys(moduleCounts)
      .sort((a, b) => moduleCounts[b] - moduleCounts[a])
      .forEach(m => {
        console.log(`  🛠️  Module: "${m.padEnd(28)}" | Project Activations: ${moduleCounts[m].toLocaleString()}`);
      });

    // ==========================================================================
    // 4. CHRONOLOGICAL ANALYSIS (DATES OF LAST ADDED)
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📅 [SECTION 4] CHRONOLOGICAL ADDITIONS (RETENTION AUDIT)");
    console.log("--------------------------------------------------------------------------");

    const yearlyCounts = {};
    addedOnDates.forEach(d => {
      const yr = d.getFullYear();
      if (!isNaN(yr)) yearlyCounts[yr] = (yearlyCounts[yr] || 0) + 1;
    });

    console.log("Chronological Additions of Project Members by Year:");
    Object.keys(yearlyCounts)
      .sort((a, b) => b - a)
      .forEach(yr => {
        console.log(`  📅 Year: ${yr} | New Members Welcomed: ${yearlyCounts[yr]}`);
      });

    // Let's get the 5 most recently added users from AccMemberCache
    const recentUsers = await prisma.$queryRaw`
      SELECT 
        data->>'name' as name, 
        email, 
        data->>'addedOn' as "addedOn"
      FROM "AccMemberCache"
      WHERE data->>'addedOn' IS NOT NULL
      ORDER BY data->>'addedOn' DESC
      LIMIT 5
    `;

    if (recentUsers.length > 0) {
      console.log("\nMost Recently Added Project Members (Dates of Last Added):");
      recentUsers.forEach((m, idx) => {
        console.log(`  #${idx + 1}. [${new Date(m.addedOn).toISOString().split('T')[0]}] ${m.name || "Unknown Name"} <${m.email}>`);
      });
    }

    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
